// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const polylabel = require("polylabel")
const electron = require("electron");
const Mustache = require("mustache");
const fs = require("fs");
const exec = require("child_process").exec;
const Menu = electron.remote.Menu;
const MenuItem = electron.remote.MenuItem;
const win = electron.remote.getCurrentWindow();
const desktopCapturer = electron.desktopCapturer;
const electronScreen = electron.screen;
const Photon = require("electron-photon");

// from LOA's codebase 
const saver = require('./saver.js');

win.removeAllListeners();

/* 
 * Global variables not in GC. Must be moved to GC later. 
 */
var interactor = null; // the external interactor process 

// Set up Mustache templates
var stats_template = document.getElementById("tmpl-stats").innerHTML;
Mustache.parse(stats_template);

// Set up the canvas
var canvas = document.getElementById("canvas");
canvas.width = document.body.clientWidth;
canvas.height = document.body.clientHeight - 15;
var ctx = canvas.getContext("2d");

/* 
 * The global context
 */
var GC = {}; 

/*
 * Global constants
 */
GC.MIN_CIRCLE_WIDTH = 7;
GC.MIN_CIRCLE_HEIGHT = 7;

GC.TOOLS = {
    TARGET_RECTANGLE: "rectangle",
    TARGET_CIRCLE: "circle",
    TARGET_POLYGON: "polygon", 
    TARGET_SMART: "smart",
    SELECTION_CURSOR: "cursor"
}

// More global variables in GC 
targets = []; // all targets in a list
GC.shape = null; // global temp shape for dragging and drawing 
GC.target_counter = 0; // used as a unique identifier for the target IDs
GC.drag = false;
GC.current_tool = GC.TOOLS.SELECTION_CURSOR;
GC.selected_targets = [];
GC.target_options_el = document.querySelector(".loom-target-options");

/*
 * Executes an external process
 */
function execute(command, callback) {
    window.data = "";
    let spawn = require("child_process").spawn;
    let commands = command.split(" ");
    let process = spawn(commands.splice(0, 1)[0], commands);

    process.stdout.on("data", function (data) {
        window.data += new TextDecoder("utf-8").decode(data); 
    });
    process.stderr.on("data", function (data) {
        console.log(new TextDecoder("utf-8").decode(data));
    });
    process.on("close", function(code){
        callback(code, window.data);
    });
}

/* 
 * Sets up the application menu
 */
var menu = Menu.buildFromTemplate([
        {
            label: "Menu",
            submenu: [
            {
                label: "Save",
                accelerator: "CmdOrCtrl+S",
                click: function () {
                    saver.save(saver.prepare(targets));
                }
            },
            {
                label: "Test",
                accelerator: "CmdOrCtrl+T",
                click: function () {
                    win.setOpacity(0);

                    let screen_size = electronScreen.getPrimaryDisplay().bounds;
                    screen_size.width;
                    screen_size.height;

                    let bounds = win.getBounds();
                    let options = { types: ['screen'], thumbnailSize: screen_size };
                    desktopCapturer.getSources(options, function (error, sources) {
                        if (error) console.log(error);
                        sources.forEach(function (source) {
                            if (source.name === 'Entire screen' || source.name === 'Screen 1') {
                                const screenshotPath = './screenshot.png';

                                let img = source.thumbnail.crop(bounds);
                                fs.writeFile(screenshotPath, img.toPng(), 
                                        function (error) {
                                            if (error) {
                                                console.log(error);
                                            }
                                            else {
                                                let cmd = "python segment.py screenshot.png";
                                                interactor = execute(cmd, function(code, output) {
                                                    polygons = JSON.parse(output);
                                                    for (var i in polygons) {
                                                        var shape = {points: polygons[i].points, type: "poly"};
                                                        addTarget(shape);
                                                    }
                                                });
                                            }
                                        }
                                        );
                            }
                        });
                    });
                    win.setOpacity(1);
                }
            },
            {
                label: "Run",
                accelerator: "CmdOrCtrl+R",
                click: function () {
                    let delay = document.getElementById('delay').value;
                    delay = (!isNaN(parseFloat(delay)) && isFinite(delay)) ? ' ' + delay : ' 250'; 
                    let cmd =
                        process.platform === "win32"
                        ? "python interact.py ./viewer/config.json 500"
                        : "python interact.py ./viewer/config.json 500";
                    interactor = execute(cmd + delay, function(output) {
                        console.log(output);
                    });
                }
            },
            {
                label: "Stop",
                accelerator: "CmdOrCtrl+K",
                click: function () {
                    if (interactor !== null) {
                        interactor.kill();
                    }
                }
            },
            {
                label: "Export Video",
                accelerator: "CmdOrCtrl+E",
                click: function () {
                    let width = parseInt(Math.floor(win.getBounds()["width"] / 2) * 2);
                    let height = parseInt(Math.floor(win.getBounds()["height"] / 2) * 2);
                    let window_size = width + ":" + height;
                    let cmd =
                        process.platform === "win32"
                        ? "generate_loom.bat "
                        : "./generate_loom.sh ";
                    execute(cmd + window_size, function (output) {
                        console.log(output);
                    });
                }
            },
            {
                label: "Developer Tools",
                accelerator: "CmdOrCtrl+I",
                click: function () {
                    win.webContents.openDevTools();
                }
            },
            {
                label: "Exit",
                accelerator: "CmdOrCtrl+Q",
                click: function () {
                    electron.remote.app.quit();
                }
            }
            ]
        }
]);
Menu.setApplicationMenu(menu);


function init() {
    canvas.addEventListener("mousedown", mouseDown, false);
    canvas.addEventListener("mouseup", mouseUp, false);
    canvas.addEventListener("mousemove", mouseMove, false);

    var win = electron.remote.getCurrentWindow();

    win.on("resize", function () {
        let dimensions = win.getBounds();
        canvas.width = dimensions.width;
        canvas.height = dimensions.height - 15;
        draw();
    });

}

function mouseDown(e) {
    if (GC.current_tool == GC.TOOLS.TARGET_RECTANGLE || 
        GC.current_tool == GC.TOOLS.TARGET_SMART || 
        GC.current_tool == GC.TOOLS.SELECTION_CURSOR) 
    {
        GC.shape = { type: "rect" };
        GC.shape.startX = e.pageX - this.offsetLeft;
        GC.shape.startY = e.pageY - this.offsetTop;
        GC.drag = true;

        // If we're selecting targets, empty the selection
        // list first
        if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR)
        {
            GC.selected_targets = [];   
        }
    } 
    else if (GC.current_tool == GC.TOOLS.TARGET_CIRCLE) 
    {
        GC.shape = { type: "circ" };
        GC.shape.startX = e.pageX - this.offsetLeft;
        GC.shape.startY = e.pageY - this.offsetTop;
        GC.drag = true;
    } 
    else if (GC.current_tool == GC.TOOLS.TARGET_POLYGON) 
    {
        if (GC.shape == null) {
            GC.shape = { type: "poly" };
            GC.shape.points = [];
        }
        let point = { x: e.pageX - this.offsetLeft, y: e.pageY - this.offsetTop };
        if (GC.shape.points[0]) 
        {
            if (Math.abs(point.x - GC.shape.points[0].x) <= 10 &&
                Math.abs(point.y - GC.shape.points[0].y) <= 10) 
            {
                point.x = GC.shape.points[0].x;
                point.y = GC.shape.points[0].y;
                GC.shape.points.push(point);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                draw(e, true);
                addTarget(JSON.parse(JSON.stringify(GC.shape)));
                GC.drag = false;
                GC.shape = null;
                return;
            }
        }
        GC.shape.points.push(point);
        GC.drag = true;
    }
}

function mouseUp(e) {
    // The polygon tool doesn't have dragging
    if (GC.current_tool !== GC.TOOLS.TARGET_POLYGON)
    {
        GC.drag = false;
    }

    if (GC.current_tool == GC.TOOLS.TARGET_RECTANGLE) 
    {
        if (typeof GC.shape.w == 'undefined' || 
            typeof GC.shape.h == 'undefined' ||
            (GC.shape.w == 0 && GC.shape.h == 0)) 
        {
            return;
        }
        addTarget(JSON.parse(JSON.stringify(GC.shape)));
    } 
    else if (GC.current_tool == GC.TOOLS.TARGET_CIRCLE) 
    {
        if (Math.abs(GC.shape.startX - GC.shape.endX) <= GC.MIN_CIRCLE_WIDTH ||
            Math.abs(GC.shape.startY - GC.shape.endY) <= GC.MIN_CIRCLE_HEIGHT)
        {
            return;
        }
        addTarget(JSON.parse(JSON.stringify(GC.shape)));
    }
    else if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR)
    {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    //GC.shape = null;// clear the selection;
    draw();

    //ctx.clearRect(0,0,canvas.width,canvas.height);
}

function mouseMove(e) {
    if (GC.drag) {
        if (GC.current_tool == GC.TOOLS.TARGET_RECTANGLE || 
            GC.current_tool == GC.TOOLS.TARGET_SMART || 
            GC.current_tool == GC.TOOLS.SELECTION_CURSOR) 
        {
            GC.shape.w = e.pageX - this.offsetLeft - GC.shape.startX;
            GC.shape.h = e.pageY - this.offsetTop - GC.shape.startY;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw(e, true, true);
        } 
        else if (GC.current_tool == GC.TOOLS.TARGET_CIRCLE) 
        {
            GC.shape.endX = e.pageX - this.offsetLeft;
            GC.shape.endY = e.pageY - this.offsetTop;
            GC.shape.midX = (GC.shape.endX - GC.shape.startX) / 2 + GC.shape.startX;
            GC.shape.midY = (GC.shape.endY - GC.shape.startY) / 2 + GC.shape.startY;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw();
        } 
        else if (GC.current_tool == GC.TOOLS.TARGET_POLYGON) 
        {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw(e, false);
        }
    }
}

/* Compare the points of the shape with the selected area (GC.shape) */
function shapeIsSelected(shape)
{
    if (GC.shape && shape && shape.type == "rect")
    {
        if (GC.shape.startX <= shape.startX &&
            GC.shape.startY <= shape.startY &&
            (GC.shape.startX + GC.shape.w) >= (shape.startX + shape.w) &&
            (GC.shape.startY + GC.shape.h) >= (shape.startY + shape.h))
        {
            return true;
        }
    }
    return false;
}

function selectOption(element, value)
{
    for (var i = 0; i < element.options.length; i++)
    {
        if (element.options[i].value == value)
        {
            element.selectedIndex = i;
        }
    }
}

function selectTarget(target)
{
    GC.selected_targets.push(target);
    GC.target_options_el.setAttribute("data-id", target.id);
    GC.target_options_el.querySelector(".name").value = target.name;
    selectOption(GC.target_options_el.querySelector(".childof"), target.childof);
    selectOption(GC.target_options_el.querySelector(".type"), target.type);
    selectOption(GC.target_options_el.querySelector(".actor"), target.actor);
}

function draw(e, done, draw_selection) {
    ctx.setLineDash([6]);
    ctx.strokeStyle = "rgb(200, 200, 200)";

    GC.selected_targets = [];
    // render all targets
    for (var i in targets) 
    {
        let shape = targets[i].shape;

        // Mark the shape as red if it's selected
        if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR && shapeIsSelected(shape))
        {
            ctx.strokeStyle = "rgb(255, 100, 100)";
            selectTarget(targets[i]);
        }
        else
        {
            ctx.strokeStyle = "rgb(200, 200, 200)";
        }

        if (shape && shape.type == "rect") 
        {
            drawRectangle(shape);
        } 
        else if (shape && shape.type == "circ") 
        {
            drawCircle(shape);
        } 
        else if (shape && shape.type == "poly") 
        {
            drawPolygon(shape);
        }
    }

    ctx.strokeStyle = "rgb(200, 200, 200)";

    if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR && !draw_selection)
    {
        return;    
    }

    // now render the new tool/target
    if (GC.current_tool == GC.TOOLS.TARGET_RECTANGLE || 
        GC.current_tool == GC.TOOLS.TARGET_SMART || 
        GC.current_tool == GC.TOOLS.SELECTION_CURSOR) 
    {
        if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR)
        {
            ctx.setLineDash([1]);
            ctx.strokeStyle = "rgb(170, 190, 250)";
        }
        drawRectangle(GC.shape);
    }
    if (GC.current_tool == GC.TOOLS.TARGET_CIRCLE)
        drawCircle(GC.shape);
    if (GC.current_tool == GC.TOOLS.TARGET_POLYGON)
        drawPolygon(GC.shape, e, done);

    if (GC.selected_targets.length == 0)
    {
        document.querySelector(".loom-target-options").classList.add("hide");
    }
    else
    {
        document.querySelector(".loom-target-options").classList.remove("hide");
    }
}

function drawRectangle(rect) 
{
    ctx.strokeRect(rect.startX, rect.startY, rect.w, rect.h);
}

function drawCircle(c) 
{
    c.rad = Math.sqrt(
            Math.pow(c.midX - c.endX, 2) + Math.pow(c.midY - c.endY, 2)
            );
    ctx.beginPath();
    ctx.arc(c.midX, c.midY, c.rad, 0, 2 * Math.PI);
    ctx.stroke();
}

function drawPolygon(poly, e, done) {
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    for (let j = 1; j < poly.points.length; j++) 
    {
        ctx.lineTo(poly.points[j].x, poly.points[j].y);
    }
    if (typeof done !== 'undefined' && !done) 
    {
        ctx.lineTo(e.pageX, e.pageY);
    }
    ctx.stroke();
}


// should be renamed to addTarget
// a single menu should always exist albeit hidden in the toolbar
//
function addTarget(shape) {
    let id = GC.target_counter++;

    var target = { id: id, shape: shape };
    if (targets.length > 0) {
        // if there are targets, copy the values from last one
        // to simplify adding linear actors
        
        var last_index = targets.length - 1;
        var type = targets[last_index].type;
        var actor = targets[last_index].actor;
        target.type = type;
        target.actor = actor;
    }
    let name = "Target " + id;
    target.name = name;
    targets.push(target);

    // add this new target to the selected targets
    GC.selected_targets = [target];
}

search = function (obj, name) {
    if (obj.name == name) {
        return obj;
    }

    if (obj.children !== undefined && obj.children.length > 0) {
        for (var i = 0; i < obj.children.length; i++) {
            var temp = search(obj.children[i], name);
            if (temp != null) return temp;
        }
    }
    return null;
};


/* 
 * Handle tool selection 
 */

function chooseSelector(type) 
{
    GC.current_tool = type;    
}

const selector_dropdown_el = document.querySelector(".loom-tool-selector");
const selector_dropdown = Photon.DropDown(selector_dropdown_el, [
    {
        label: "Circle",
        click: function() { chooseSelector(GC.TOOLS.TARGET_CIRCLE); }
    },
    {
        label: "Rectangle",
        click: function() { chooseSelector(GC.TOOLS.TARGET_RECTANGLE); }
    },
    {
        label: "Polygon",
        click: function() { chooseSelector(GC.TOOLS.TARGET_POLYGON); }
    },
    {
        label: "Smart Selection", 
        click: function() { chooseSelector(GC.TOOLS.TARGET_SMART); }
    }
]);

selector_dropdown.closePopup();

selector_dropdown_el.onclick = function(){
    loom_selection_cursor_el.classList.remove("active");
    selector_dropdown.popup(); 
};

const loom_selection_cursor_el = document.querySelector(".loom-selection-cursor");
loom_selection_cursor_el.onclick = function()
{
    chooseSelector(GC.TOOLS.SELECTION_CURSOR);   
    this.classList.toggle("active");
}

/* 
 * Set up event handlers for the target option form
 */

GC.target_options_el.querySelector(".remove").addEventListener("click", function () {
    let id = parseInt(GC.target_options_el.getAttribute("data-id"));
    for (i in targets) 
    {
        if (targets[i].id == id) 
        {
            targets.splice(i, 1);
            break;
        }
    }
    document.querySelector(".loom-target-options").classList.add("hide");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw();
});

GC.target_options_el.querySelector(".childof").addEventListener("focus", function () {
    // remove all current options
    while (this.options.length > 0) {
        this.options.remove(0);
    }

    let option = document.createElement("option");
    option.innerHTML = "Parent";
    this.options.add(option);
    let id = parseInt(this.parentNode.getAttribute("data-id"));
    for (i in targets) 
    {
        let target = targets[i];
        //if (target.id != id) 
        {
            let option = document.createElement("option");
            option.innerHTML = target.name;
            option.value = target.name;
            this.options.add(option);
        }
    }
});

GC.target_options_el.querySelector(".name").addEventListener("change", function () {
    let id = parseInt(this.parentNode.getAttribute("data-id"));
    for (var i in targets) 
    {
        let target = targets[i];
        if (target.id == id) 
        {
            target.name = this.value;
        }
    }
});

GC.target_options_el.querySelector(".childof").addEventListener("change", function (e) {
    let id = parseInt(this.parentNode.getAttribute("data-id"));
    for (var i in targets) 
    {
        let target = targets[i];
        if (target.id == id) 
        {
            target.childof = e.target.options[e.target.selectedIndex].value;
        }
    }
});

GC.target_options_el.querySelector(".type").addEventListener("change", function (e) {
    let id = parseInt(this.parentNode.getAttribute("data-id"));
    for (var i in targets) 
    {
        let target = targets[i];
        if (target.id == id) 
        {
            target.type = e.target.options[e.target.selectedIndex].value;
        }
    }
});

GC.target_options_el.querySelector(".actor").addEventListener("change", function (e) {
    let id = parseInt(this.parentNode.getAttribute("data-id"));
    for (var i in targets) 
    {
        let target = targets[i];
        if (target.id == id) 
        {
            target.actor = e.target.options[e.target.selectedIndex].value;
        }
    }
});

init();

