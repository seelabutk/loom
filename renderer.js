// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

//import polylabel from 'polylabel';
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

var GC = {}; // The global context; 
GC.shapes = {}; // temporary shapes for drawing

win.removeAllListeners();

var interactor = null; // the external interactor process 

// Set up Mustache templates
var template = document.getElementById("tmpl-menu").innerHTML;
Mustache.parse(template);
var stats_template = document.getElementById("tmpl-stats").innerHTML;
Mustache.parse(stats_template);

// Set up the canvas
var canvas = document.getElementById("canvas");
canvas.width = document.body.clientWidth;
canvas.height = document.body.clientHeight - 15;
var ctx = canvas.getContext("2d");

// Set up the global context
targets = []; // all targets in a list
GC.shapes.rect = null; // global temp rectangle for dragging and drawing rectangles
GC.shapes.circ = null;
GC.shapes.poly = null;
GC.target_counter = 0; // used as a unique identifier for the target IDs
GC.drag = false;

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
                    fs.writeFile(
                            "./viewer/config.json",
                            JSON.stringify(prepareSave(targets)),
                            () => { }
                            );
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
                                                        addMenu(shape);
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
    if (GC.selector_type == "rectangle") 
    {
        GC.shapes.rect = { type: "rect" };
        GC.shapes.rect.startX = e.pageX - this.offsetLeft;
        GC.shapes.rect.startY = e.pageY - this.offsetTop;
        GC.drag = true;
    } 
    else if (GC.selector_type == "circle") 
    {
        GC.shapes.circ = { type: "circ" };
        GC.shapes.circ.startX = e.pageX - this.offsetLeft;
        GC.shapes.circ.startY = e.pageY - this.offsetTop;
        GC.drag = true;
    } 
    else if (GC.selector_type == "polygon") 
    {
        if (GC.shapes.poly == null) {
            GC.shapes.poly = { type: "poly" };
            GC.shapes.poly.points = [];
        }
        let point = { x: e.pageX - this.offsetLeft, y: e.pageY - this.offsetTop };
        if (GC.shapes.poly.points[0]) {
            if (
                    Math.abs(point.x - GC.shapes.poly.points[0].x) <= 10 &&
                    Math.abs(point.y - GC.shapes.poly.points[0].y) <= 10
               ) {
                point.x = GC.shapes.poly.points[0].x;
                point.y = GC.shapes.poly.points[0].y;
                GC.shapes.poly.points.push(point);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                draw(e, true);
                addMenu(JSON.parse(JSON.stringify(GC.shapes.poly)));
                GC.drag = false;
                GC.shapes.poly = null;
                return;
            }
        }
        GC.shapes.poly.points.push(point);
        GC.drag = true;
    }
}

function mouseUp(e) {
    if (GC.selector_type !== "polygon") GC.drag = false;
    if (GC.selector_type == "rectangle") 
    {
        if (typeof GC.shapes.rect.w == 'undefined' 
                || typeof GC.shapes.rect.h == 'undefined' 
                || (GC.shapes.rect.w == 0 && GC.shapes.rect.h == 0)) 
            return;
        addMenu(JSON.parse(JSON.stringify(GC.shapes.rect)));
    } 
    else if (GC.selector_type == "circle") 
    {
        if (Math.abs(GC.shapes.circ.startX - GC.shapes.circ.endX) <= 7 
                || Math.abs(GC.shapes.circ.startY - GC.shapes.circ.endY) <= 7)
            return;
        addMenu(JSON.parse(JSON.stringify(GC.shapes.circ)));
    }
    GC.shapes.rect = null;
    GC.shapes.circ = null;
    //ctx.clearRect(0,0,canvas.width,canvas.height);
}

function mouseMove(e) {
    if (GC.drag) {
        if (GC.selector_type == "rectangle") {
            GC.shapes.rect.w = e.pageX - this.offsetLeft - GC.shapes.rect.startX;
            GC.shapes.rect.h = e.pageY - this.offsetTop - GC.shapes.rect.startY;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw();
        } 
        else if (GC.selector_type == "circle") 
        {
            GC.shapes.circ.endX = e.pageX - this.offsetLeft;
            GC.shapes.circ.endY = e.pageY - this.offsetTop;
            GC.shapes.circ.midX = (GC.shapes.circ.endX - GC.shapes.circ.startX) / 2 + GC.shapes.circ.startX;
            GC.shapes.circ.midY = (GC.shapes.circ.endY - GC.shapes.circ.startY) / 2 + GC.shapes.circ.startY;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw();
        } 
        else if (GC.selector_type == "polygon") 
        {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw(e, false);
        }
    }
}

function draw(e, done) {
    ctx.setLineDash([6]);
    ctx.strokeStyle = "rgb(200, 200, 200)";
    for (var i in targets) {
        let shape = targets[i].shape;
        if (shape && shape.type == "rect") {
            drawRectangle(shape);
        } else if (shape && shape.type == "circ") {
            drawCircle(shape);
        } else if (shape && shape.type == "poly") {
            drawPolygon(shape);
        }
    }

    if (GC.selector_type == "rectangle")
        drawRectangle(GC.shapes.rect);
    if (GC.selector_type == "circle")
        drawCircle(GC.shapes.circ);
    if (GC.selector_type == "polygon")
        drawPolygon(GC.shapes.poly, e, done);
}

function drawRectangle(rect) {
    ctx.strokeRect(rect.startX, rect.startY, rect.w, rect.h);
}

function drawCircle(c) {
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
    for (let j = 1; j < poly.points.length; j++) {
        ctx.lineTo(poly.points[j].x, poly.points[j].y);
    }
    if (typeof done !== 'undefined' && !done) {
        ctx.lineTo(e.pageX, e.pageY);
    }
    ctx.stroke();
}

function addMenu(shape) {
    var menu = document.createElement("div");
    menu.style.position = "absolute";
    if (shape.type && shape.type == "rect") {
        menu.style.left = shape.startX + 10 + "px";
        menu.style.top = shape.startY + "px";
    } else if (shape.type && shape.type == "circ") {
        menu.style.left =
            shape.midX + shape.rad * Math.cos(45 * (Math.PI / 180)) + "px";
        menu.style.top =
            shape.midY -
            shape.rad * Math.sin(45 * (Math.PI / 180)) -
            9.25 -
            4.29 +
            "px";
    } else if (shape.type && shape.type == "poly") {
        menu.style.left = shape.points[0].x - 4.29 + "px";
        menu.style.top = shape.points[0].y - 9.25 + "px";
        let polygon = [];
        for (let i = 0; i < shape.points.length; i++) {
            polygon.push([shape.points[i].x, shape.points[i].y]);
        }
        let center = polylabel([polygon])
            shape.centerX = center[0];
        shape.centerY = center[1];
    }
    menu.style.zIndex = 10000;
    menu.classList.add("menu");

    let id = GC.target_counter++;
    menu.setAttribute("data-id", id);
    menu.innerHTML = Mustache.render(template, { shape: JSON.stringify(shape) });
    menu.querySelector(".showhide").addEventListener("click", function () {
        menu.querySelectorAll(".setting").forEach(function (item) {
            item.classList.toggle("hide");
        });
    });
    document.body.appendChild(menu);
    menu.querySelector(".remove").addEventListener("click", function () {
        let id = parseInt(menu.getAttribute("data-id"));
        for (i in targets) {
            if (targets[i].id == id) {
                targets.splice(i, 1);
                menu.remove();
                break;
            }
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        draw();
    });

    menu.querySelector(".childof").addEventListener("focus", function () {
        // remove all current options
        while (this.options.length > 0) {
            this.options.remove(0);
        }

        let option = document.createElement("option");
        option.innerHTML = "Parent";
        this.options.add(option);
        let id = parseInt(this.parentNode.getAttribute("data-id"));
        for (i in targets) {
            let target = targets[i];
            if (target.id != id) {
                let option = document.createElement("option");
                option.innerHTML = target.name;
                this.options.add(option);
            }
        }
    });

    menu.querySelector(".name").addEventListener("change", function () {
        let id = parseInt(this.parentNode.getAttribute("data-id"));
        for (var i in targets) {
            let target = targets[i];
            if (target.id == id) {
                target.name = this.value;
            }

        }
    });

    if (targets.length > 0) {
        // if there are targets, copy the values from last one
        // to simplify adding linear actors
        var last_index = targets.length - 1;
        var last_menu = targets[last_index]["menu"];
        var type = last_menu.querySelector(".type").selectedIndex;
        var actor = last_menu.querySelector(".actor").selectedIndex;
        menu.querySelector(".type").selectedIndex = type;
        menu.querySelector(".actor").selectedIndex = actor;
    }
    let name = "Target " + id;
    menu.querySelector(".name").value = name;
    targets.push({ id: id, name: name, menu: menu, shape: shape });
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

function prepareSave(targets) {
    var output = {};
    output.id = -1;
    output.name = "root";
    output.children = [];
    output.window = win.getBounds();

    var not_placed = [];
    for (i in targets) {
        var menu = targets[i].menu;
        var id = parseInt(menu.getAttribute("data-id"));
        var name = menu.querySelector(".name").value.toLowerCase();
        var type = "linear"; //menu.querySelector(".type").value.toLowerCase();
        var actor = menu.querySelector(".actor").value.toLowerCase();
        var parent = menu
            .querySelector(".childof")
            .selectedOptions[0].value.toLowerCase();
        if (parent == "parent") {
            parent = "root";
        }
        if (actor == "arcball-reset") {
            type = "helper";
        }
        var temp = JSON.parse(menu.querySelector(".shape").innerHTML);
        var shape = {};
        shape.type = temp.type;

        let ratio = 1; //window.devicePixelRatio;
        if (shape.type == "rect") {
            shape.x = temp.startX * ratio;
            shape.y = temp.startY * ratio;
            shape.width = temp.w * ratio;
            shape.height = temp.h * ratio;
        } else if (shape.type == "circ") {
            shape.centerX = temp.midX * ratio;
            shape.centerY = temp.midY * ratio;
            shape.radius = temp.rad * ratio;
        } else if (shape.type == "poly") {
            shape.centerX = temp.centerX * ratio;
            shape.centerY = temp.centerY * ratio;
            shape.points = temp.points;
        }

        var obj = {
            id: id,
            name: name,
            type: type,
            actor: actor,
            parent: parent,
            shape: shape
        };
        if (parent == "root") {
            output.children.push(obj);
        } else {
            not_placed.push(obj);
        }
    }

    while (not_placed.length > 0) {
        for (var i = 0; i < not_placed.length; i++) {
            var found_parent = search(output, not_placed[i].parent);
            if (found_parent != null) {
                if (found_parent.children === undefined) {
                    found_parent.children = [];
                }
                // found_parent has children, set its type to parallel for now
                found_parent.type = "parallel";

                found_parent.children.push(not_placed[i]);
                not_placed.splice(i, 1);
                break;
            }
        }
    }

    return output;
}


function chooseSelector(type) 
{
    GC.selector_type = type;    
}

const selector_dropdown_el = document.querySelector(".selector");
const selector_dropdown = Photon.DropDown(selector_dropdown_el, [
        {
            label: "Circle",
            click: function() { chooseSelector("circle"); }
        },
        {
            label: "Rectangle",
            click: function() { chooseSelector("rectangle"); }
        },
        {
            label: "Polygon",
            click: function() { chooseSelector("polygon"); }
        },
        {
            label: "Smart Selection", 
            click: function() { chooseSelector("smart"); }
        }
]);

selector_dropdown.closePopup();

selector_dropdown_el.onclick = function(){
    selector_dropdown.popup(); 
};

init();
