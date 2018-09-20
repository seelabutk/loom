// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const polylabel = require("polylabel")
const electron = require("electron");
const fs = require("fs");
const Menu = electron.remote.Menu;
const win = electron.remote.getCurrentWindow();
const desktopCapturer = electron.desktopCapturer;
const electronScreen = electron.screen;
const Photon = require("electron-photon");

// from LOA's codebase 
const saver = require('./saver.js');

win.removeAllListeners();

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
    TARGET_GRID: "grid",
    TARGET_MAGIC_WAND: 'magic',
    SELECTION_CURSOR: "cursor"
}

// More global variables in GC
GC.shape = null; // global temp shape for dragging and drawing
GC.target_counter = 0; // used as a unique identifier for the target IDs
GC.drag = false;
GC.current_tool = GC.TOOLS.SELECTION_CURSOR;
GC.selected_targets = [];
GC.target_options_el = document.querySelector(".loom-target-options");
GC.interactor = null;
GC.grid = [];

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
                click: save
            },
            {
                label: "Run",
                accelerator: "CmdOrCtrl+R",
                click: runInteraction
            },
            {
                label: "Stop",
                accelerator: "CmdOrCtrl+K",
                click: function() {
                    if (GC.interactor !== null) {
                        GC.interactor.kill();
                    }
                }
            },
            {
                label: "Export Video",
                accelerator: "CmdOrCtrl+E",
                click: exportLoom
            },
            {
                label: "Developer Tools",
                accelerator: "CmdOrCtrl+I",
                click: function() {
                    win.webContents.openDevTools();
                }
            },
            {
                label: "Exit",
                accelerator: "CmdOrCtrl+Q",
                click: function() {
                    electron.remote.app.quit();
                }
            }
            ]
        }
]);
Menu.setApplicationMenu(menu);

/* 
 * Save the targets from all tabs in a JSON
 */
function save()
{
    let targets = [];
    for (const tab in GC.tabs) {
        if (GC.tabs.hasOwnProperty(tab))
            for (const target of GC.tabs[tab]) {
                targets.push(target)
            }
    }
    saver.save(saver.prepare(targets, win.getBounds()));
}

/* 
 * Run the automatic interaction externally 
 */
function runInteraction()
{
    let delay = ''; //document.getElementById("delay").value;
    delay =
        !isNaN(parseFloat(delay)) && isFinite(delay) ? " " + delay : " 250";
    let cmd =
        process.platform === "win32"
        ? "python interact.py ./viewer/config.json 500"
        : "python interact.py ./viewer/config.json 500";
    GC.interactor = execute(cmd + delay, function(output) {
        console.log(output);
    });
}

/*
 * TODO
 * Shouldn't the width and height be sent too?
 */
function exportLoom()
{
    let width = parseInt(Math.floor(win.getBounds()["width"] / 2) * 2);
    let height = parseInt(Math.floor(win.getBounds()["height"] / 2) * 2);
    let window_size = width + ":" + height;
    let cmd =
        process.platform === "win32"
        ? "generate_loom.bat "
        : "./generate_loom.sh ";
    execute(cmd + window_size, function(output) {
        console.log(output);
    });
}

/* 
 * Smart-select functions
 */
function smartSelect(bounds)
{
    win.setOpacity(0);

    var screen_size = electronScreen.getPrimaryDisplay().bounds;
    screen_size.width;
    screen_size.height;

    var window_bounds = win.getBounds();
    bounds.x += window_bounds.x;
    bounds.y += window_bounds.y;
    var options = { types: ['screen'], thumbnailSize: screen_size };
    desktopCapturer.getSources(options, function (error, sources) {
        if (error) console.log(error);
        sources.forEach(function(source){
            handleScreenshot(source, bounds);
        });
    });
    win.setOpacity(1);
}

function handleScreenshot(source, bounds) {
    if (source.name === "Entire screen" || source.name === "Screen 1") {
        const screenshotPath = "./screenshot.png";

        let img = source.thumbnail.crop(bounds);
        fs.writeFile(screenshotPath, img.toPng(), function(error){
            contourSegmentation(error, 50, false);
        });
    }
}

function contourSegmentation(error, sensitivity, apply)
{
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw();

    if (error) 
    {
        console.log(error);
        return false;
    }
    else 
    {
        let cmd = "python segment.py screenshot.png " + sensitivity.toString();
        GC.interactor = execute(cmd, function(code, output) {
            polygons = JSON.parse(output);
            for (var i = 0; i < polygons.length; i++) {
                var shape = {points: polygons[i].points, type: "poly"};
                // Gotta get the GC.shape info and add its x and y to each shape 

                for (var j = 0; j < shape.points.length; j++)
                {
                    shape.points[j].x += GC.shape.startX;
                    shape.points[j].y += GC.shape.startY;
                }
                if (apply == true)
                {
                    addTarget(shape);
                }
                else
                {
                    drawShape(shape);
                }
            }
        });
    }
}

/*
 * Grid functions
 */

function changeGridDimensions(widthSegments, heightSegments, spaceBetween) {
  if (GC.shape == null || GC.shape.type !== "rect") return;
  
  GC.grid = [];

  widthSegments = isNaN(widthSegments) ? 1 : widthSegments;
  heightSegments = isNaN(heightSegments) ? 1 : heightSegments;
  spaceBetween = isNaN(spaceBetween) ? 0 : spaceBetween;

  const space = spaceBetween !== 0 ? spaceBetween - 1 : 0;
  const width = Math.round((GC.shape.w - space * (widthSegments - 1)) / widthSegments);
  const height = Math.round((GC.shape.h - space * (heightSegments - 1)) / heightSegments);
  const startX = GC.shape.startX;
  const startY = GC.shape.startY;

  for (let i = 0; i < heightSegments; i++) {
    for (let j = 0; j < widthSegments; j++) {
      const shape = {
        type: "rect",
        startX: startX + j * width + j * space,
        startY: startY + i * height + i * space,
        w: width,
        h: height
      }

      GC.grid.push(shape);
    }
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw();
}

/* 
 * Magic wand functions
 */

function magicWandClick(x, y)
{
    win.setOpacity(0);

    var screen_size = electronScreen.getPrimaryDisplay().bounds;
    screen_size.width;
    screen_size.height;

    var window_bounds = win.getBounds();
    var options = { types: ['screen'], thumbnailSize: screen_size };
    desktopCapturer.getSources(options, function (error, sources) {
        if (error) console.log(error);
        sources.forEach(function(source){
            handleMagicWandScreenshot(source, window_bounds, x, y);
        });
    });
    win.setOpacity(1);
}

function handleMagicWandScreenshot(source, bounds, x, y) {
    if (source.name === "Entire screen" || source.name === "Screen 1") {
        let img = source.thumbnail.crop(bounds);
        const screenshotPath = "./screenshot.png";
        fs.writeFile(screenshotPath, img.toPng(), function(error){
            GC.previous_magic_x = x;
            GC.previous_magic_y = y;
            magicWand(x, y, 15, false);
        });
    }
}

function magicWand(x, y, threshold, apply)
{
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var magic_wand_options = {};
    magic_wand_options.x = x;
    magic_wand_options.y = y;
    magic_wand_options.threshold = threshold;

    var image_el = new Image(); 
    image_el.magic_wand_options = magic_wand_options;

    image_el.onload = function()
    {
        var magic_wand_options = this.magic_wand_options;
        var canvas = document.createElement("canvas")
        var temp_context = canvas.getContext("2d");
        temp_context.canvas.width = this.width;
        temp_context.canvas.height = this.height;
        temp_context.drawImage(this, 0, 0);

        var image_obj = {
            width: this.width,
            height: this.height, 
            bytes: 4,
            data: temp_context.getImageData(0, 0, this.width, this.height).data
        };

        mask = MagicWand.floodFill(image_obj, magic_wand_options.x, magic_wand_options.y, magic_wand_options.threshold);
        var cs = MagicWand.traceContours(mask);
        cs = MagicWand.simplifyContours(cs, 0, 30);
        var points = [];
        for (var i = 0; i < cs.length; i++) {
            if (cs[i].inner) continue;
            for (let p of cs[i].points)
            {
                points.push(p);
            }
        }

        GC.shape = {"type": "poly", "points": points};

        if (apply == true)
        {
            addTarget(GC.shape); 
        }

        // gotta draw otherwise the mouseUp will take over asynchronously and erase things
        draw(); 
    }
    image_el.src = "screenshot.png";
}

/* 
 * Initializations
 */
function init() {
    canvas.addEventListener("mousedown", mouseDown, false);
    canvas.addEventListener("mouseup", mouseUp, false);
    canvas.addEventListener("mousemove", mouseMove, false);

    var win = electron.remote.getCurrentWindow();

    win.on("resize", function() {
        let dimensions = win.getBounds();
        canvas.width = dimensions.width;
        canvas.height = dimensions.height - 15;
        draw(null, null, null, true);
    });
}

function mouseDown(e) {
    hideSmartSelectionOptions();
    hideGridSelectionOptions();
    hideMagicWandOptions();

    if (GC.current_tool == GC.TOOLS.TARGET_RECTANGLE || 
            GC.current_tool == GC.TOOLS.TARGET_SMART ||
            GC.current_tool == GC.TOOLS.TARGET_GRID ||
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
        
        if (GC.current_tool == GC.TOOLS.TARGET_GRID)
        {
          GC.grid = [];
        }
    } 
    else if (GC.current_tool == GC.TOOLS.TARGET_CIRCLE) 
    {
        GC.shape = { type: "circ" };
        GC.shape.startX = e.pageX - this.offsetLeft;
        GC.shape.startY = e.pageY - this.offsetTop;
        GC.drag = true;
    } else if (GC.current_tool == GC.TOOLS.TARGET_POLYGON) {
        if (!GC.shape || (GC.shape && GC.shape.type !== "poly")) {
            GC.shape = { type: "poly" };
            GC.shape.points = [];
        }
        let point = { x: e.pageX - this.offsetLeft, y: e.pageY - this.offsetTop };
        if (GC.shape.points[0]) {
            if (
                    Math.abs(point.x - GC.shape.points[0].x) <= 10 &&
                    Math.abs(point.y - GC.shape.points[0].y) <= 10
               ) {
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

    if (GC.current_tool == GC.TOOLS.TARGET_RECTANGLE) {
        if (
                typeof GC.shape.w == "undefined" ||
                typeof GC.shape.h == "undefined" ||
                (GC.shape.w == 0 && GC.shape.h == 0)
           ) {
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
    else if (GC.current_tool == GC.TOOLS.TARGET_SMART)
    {
        var bounds = {
            x: GC.shape.startX, 
            y: GC.shape.startY,
            width: GC.shape.w,
            height: GC.shape.h
        }
        smartSelect(bounds);
        showSmartSelectionOptions();     
    }
    else if (GC.current_tool == GC.TOOLS.TARGET_GRID) 
    {
        showGridSelectionOptions();
    }
    else if (GC.current_tool == GC.TOOLS.TARGET_MAGIC_WAND)
    {
        magicWandClick(e.pageX, e.pageY);
        showMagicWandOptions();
    }
    else if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR)
    {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    draw();
}

function mouseMove(e) {
    if (GC.drag) {
        if (GC.current_tool == GC.TOOLS.TARGET_RECTANGLE || 
                GC.current_tool == GC.TOOLS.TARGET_SMART ||
                GC.current_tool == GC.TOOLS.TARGET_GRID ||
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
    if (GC.shape && shape && shape.type == "circ")
    {
        if (GC.shape.startX <= shape.startX &&
                GC.shape.startY <= shape.startY &&
                (GC.shape.startX + GC.shape.w) >= shape.endX &&
                (GC.shape.startY + GC.shape.h) >= shape.endY)
        {
            return true;
        }
    }
    if (GC.shape && shape && shape.type == "poly")
    {
        for (var i = 0; i < shape.points.length; i++)
        {
            if (shape.points[i].x <= GC.shape.startX ||
                    shape.points[i].y <= GC.shape.startY ||
                    shape.points[i].x >= (GC.shape.startX + GC.shape.w) ||
                    shape.points[i].y >= (GC.shape.startY + GC.shape.h))
            {
                return false;
            }
        }
        return true;
    }
    return false;
}

function hideSmartSelectionOptions()
{
    var smart_options_el = document.querySelector(".loom-smart-target-options")
        smart_options_el.classList.add("hide");
}

function showSmartSelectionOptions()
{
    var smart_options_el = document.querySelector(".loom-smart-target-options")
        smart_options_el.classList.remove("hide");
}

function hideGridSelectionOptions()
{
  var grid_options_el = document.querySelector(".loom-grid-target-options")
        grid_options_el.classList.add("hide");
}

function showGridSelectionOptions()
{
  var grid_options_el = document.querySelector(".loom-grid-target-options")
    grid_options_el.classList.remove("hide");

}

function hideMagicWandOptions()
{
    var magic_options_el = document.querySelector(".loom-magic-target-options")
        magic_options_el.classList.add("hide");
}

function showMagicWandOptions()
{
    var magic_options_el = document.querySelector(".loom-magic-target-options")
        magic_options_el.classList.remove("hide");
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

function draw(e, done, draw_selection, tabChange) {
    //ctx.setLineDash([5]);
    ctx.strokeStyle = "rgb(200, 200, 200)";
    ctx.lineWidth = 1;

    GC.selected_targets = [];
    // render all targets
    for (var i = 0; i < GC.tabs[GC.selected_tab].length; i++) {
        let shape = GC.tabs[GC.selected_tab][i].shape;

        // Mark the shape as red if it's selected
        if (
                GC.current_tool == GC.TOOLS.SELECTION_CURSOR &&
                shapeIsSelected(shape)
           ) {
            ctx.strokeStyle = "rgb(255, 50, 50)";
            selectTarget(GC.tabs[GC.selected_tab][i]);
        } else {
            ctx.strokeStyle = "rgb(200, 200, 200)";
        }

        if (shape && shape.type == "rect") {
            drawRectangle(shape);
        } else if (shape && shape.type == "circ") {
            drawCircle(shape);
        } else if (shape && shape.type == "poly") {
            drawPolygon(shape);
        }
    }

    //render temporary grid targets
    for (let i = 0, n = GC.grid.length; i < n; i++) {
      drawRectangle(GC.grid[i]);
    }

    ctx.strokeStyle = "rgb(200, 200, 200)";

    if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR && !draw_selection) {
        return;
    }

    // now render the new tool/target
    if (
            GC.current_tool == GC.TOOLS.TARGET_RECTANGLE ||
            GC.current_tool == GC.TOOLS.TARGET_SMART ||
            GC.current_tool == GC.TOOLS.TARGET_GRID ||
            GC.current_tool == GC.TOOLS.SELECTION_CURSOR
       ) {
        if (GC.current_tool == GC.TOOLS.SELECTION_CURSOR) {
            ctx.setLineDash([1]);
            ctx.strokeStyle = "rgb(100, 120, 250)";
        }
        if (!tabChange)
        {
            drawRectangle(GC.shape);
        }
    }

    if (GC.current_tool == GC.TOOLS.TARGET_MAGIC_WAND)
    {
        if (!tabChange)
        {
            drawPolygon(GC.shape, null, true);
        }
    }

    if (GC.current_tool == GC.TOOLS.TARGET_CIRCLE && !tabChange) 
        drawCircle(GC.shape);
    if (GC.current_tool == GC.TOOLS.TARGET_POLYGON && !tabChange)
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

function drawShape(shape)
{
    if (shape.type == "rect")
        drawRectangle(shape);
    if (shape.type == "circ")
        drawCircle(shape);
    if (shape.type == "poly")
        drawPolygon(shape, null, true);
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
    for (let i = 1; i < poly.points.length; i++) {
        ctx.lineTo(poly.points[i].x, poly.points[i].y);
    }
    if (typeof done !== "undefined" && !done) {
        ctx.lineTo(e.pageX, e.pageY);
    }
    ctx.stroke();
}

// a single menu should always exist albeit hidden in the toolbar
//
function addTarget(shape) {
    // Make sure the shape is correctly formatted
    if (
            shape &&
            shape.type &&
            shape.type == "poly" &&
            typeof shape.points == "undefined"
       )
        return false;

    let id = GC.target_counter++;

    var target = { id: id, shape: shape };
    if (GC.tabs[GC.selected_tab].length > 0) {
        // if there are targets, copy the values from last one
        // to simplify adding linear actors

        var last_index = GC.tabs[GC.selected_tab].length - 1;
        var type = GC.tabs[GC.selected_tab][last_index].type;
        var actor = GC.tabs[GC.selected_tab][last_index].actor;
        target.type = type;
        target.actor = actor;
    } else {
        target.type = "Linear"
            target.actor = "Arcball"
    }

    if (shape.type && shape.type == "poly") {
        let polygon = [];
        for (let i = 0; i < shape.points.length; i++) {
            polygon.push([shape.points[i].x, shape.points[i].y]);
        }
        let center = polylabel([polygon])
            shape.centerX = center[0];
        shape.centerY = center[1];
    }

    let name = "Target " + id;
    target.name = name;
    target.parent = "parent"
        GC.tabs[GC.selected_tab].push(target);

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

function chooseSelector(type) {
    GC.current_tool = type;
}

const selector_dropdown_el = document.querySelector(".loom-tool-selector");
const selector_dropdown = Photon.DropDown(selector_dropdown_el, [
        {
            label: "Circle",
            click: function() {
                chooseSelector(GC.TOOLS.TARGET_CIRCLE);
            }
        },
        {
            label: "Rectangle",
            click: function() {
                chooseSelector(GC.TOOLS.TARGET_RECTANGLE);
            }
        },
        {
            label: "Polygon",
            click: function() {
                chooseSelector(GC.TOOLS.TARGET_POLYGON);
            }
        },
        {
            label: "Smart Selection",
            click: function() {
                chooseSelector(GC.TOOLS.TARGET_SMART);
            }
        },
        {
            label: "Grid Selection",
            click: function() {
                chooseSelector(GC.TOOLS.TARGET_GRID);
            }
        },
        {
            label: "Magic Wand",
            click: function() {
                chooseSelector(GC.TOOLS.TARGET_MAGIC_WAND);
            }
        }
]);

selector_dropdown.closePopup();

selector_dropdown_el.onclick = function() {
    loom_selection_cursor_el.classList.remove("active");
    selector_dropdown.popup();
};

const loom_selection_cursor_el = document.querySelector(
        ".loom-selection-cursor"
        );
loom_selection_cursor_el.onclick = function() {
    chooseSelector(GC.TOOLS.SELECTION_CURSOR);
    this.classList.toggle("active");
};

GC.selected_tab = "1";
GC.tabs = {
    "1": [],
    "2": []
}

function deactivateAllTabs()
{
    let tabs = document.querySelectorAll(".tab-item");
    tabs.forEach(function(tab){
        tab.classList.remove("active");
    });
}

/* 
 * Removes the tab, shifts other tabs, and removes all targets
 * within the tab
 */
function removeTab(tab)
{
    // TODO
}

document.querySelector('.tab-group').addEventListener("click", function(e){ 
    if (e.target.getAttribute("data-tab-action") == "add") {
        let tab = document.createElement("div");

        var tab_id = (Object.keys(GC.tabs).length + 1).toString();

        tab.classList.add("tab-item");
        deactivateAllTabs();
        tab.classList.add("active"); // select the tab
        tab.setAttribute("data-tab-id", tab_id);

        GC.tabs[tab_id] = []
        GC.selected_tab = tab_id;
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        draw(null, null, null, true);

        var tab_close_icon = document.createElement("span");
        tab_close_icon.classList.add("icon", "icon-cancel", "icon-close-tab");
        tab.appendChild(tab_close_icon);
        tab.innerHTML += `Workspace ${tab_id}`;

        return e.srcElement.insertAdjacentElement("beforebegin", tab);
    } 

    deactivateAllTabs();
    e.target.classList.add("active");
    var tab_id = e.target.getAttribute('data-tab-id');
    GC.selected_tab = tab_id;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(null, null, null, true);
})

/* 
 * Set up event handlers for the target option form
 */

GC.target_options_el.querySelector(".remove").addEventListener(
        "click",
        function() {
            for (var j = 0; j < GC.selected_targets.length; j++) {
                for (var i = 0; i < GC.tabs[GC.selected_tab].length; i++) {
                    if (GC.tabs[GC.selected_tab][i].id == GC.selected_targets[j].id) {
                        GC.tabs[GC.selected_tab].splice(i, 1);
                        break;
                    }
                }
            }
            document.querySelector(".loom-target-options").classList.add("hide");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            draw();
        });

GC.target_options_el.querySelector(".childof").addEventListener(
        "focus",
        function() {
            // remove all current options
            while (this.options.length > 0) {
                this.options.remove(0);
            }

            let option = document.createElement("option");
            option.innerHTML = "Parent";
            this.options.add(option);

            Object.keys(GC.tabs).forEach(tab => {

                /* separators between tab targets w/ description of tab they belong to */
                let option = document.createElement("option");
                option.innerHTML = tab;
                option.value = tab;
                option.disabled = true;
                this.options.add(option);

                Object.keys(GC.tabs[tab]).forEach(target => {
                    let option = document.createElement("option");
                    option.innerHTML = GC.tabs[tab][target].name;
                    option.value = GC.tabs[tab][target].name;
                    this.options.add(option);
                })
            })
        });

GC.target_options_el.querySelector(".name").addEventListener(
        "change",
        function() {
            for (var j = 0; j < GC.selected_targets.length; j++) {
                for (var i = 0; i < GC.tabs[GC.selected_tab].length; i++) {
                    let target = GC.tabs[GC.selected_tab][i];
                    if (target.id == GC.selected_targets[j].id) {
                        target.name = this.value;
                    }
                }
            }
        });

GC.target_options_el.querySelector(".childof").addEventListener(
        "change",
        function(e) {
            for (var j = 0; j < GC.selected_targets.length; j++) {
                for (var i = 0; i < GC.tabs[GC.selected_tab].length; i++) {
                    let target = GC.tabs[GC.selected_tab][i];
                    if (target.id == GC.selected_targets[j].id) {
                        target.childof = e.target.options[e.target.selectedIndex].value;
                    }
                }
            }
        });

GC.target_options_el.querySelector(".type").addEventListener(
        "change",
        function(e) {
            for (var j = 0; j < GC.selected_targets.length; j++) {
                for (var i = 0; i < GC.tabs[GC.selected_tab].length; i++) {
                    let target = GC.tabs[GC.selected_tab][i];
                    if (target.id == GC.selected_targets[j].id) {
                        target.type = e.target.options[e.target.selectedIndex].value;
                    }
                }
            }
        });

GC.target_options_el.querySelector(".actor").addEventListener(
        "change",
        function(e) {
            for (var j = 0; j < GC.selected_targets.length; j++) {
                for (var i = 0; i < GC.tabs[GC.selected_tab].length; i++) {
                    let target = GC.tabs[GC.selected_tab][i];
                    if (target.id == GC.selected_targets[j].id) {
                        target.actor = e.target.options[e.target.selectedIndex].value;
                    }
                }
            }
        });

/*
 * Set up handlers for the smart-target-options
 */
var smart_options_el = document.querySelector(".loom-smart-target-options");
smart_options_el.querySelector(".slider").addEventListener("change", function(){
    contourSegmentation(false, this.value, false); 
});

smart_options_el.querySelector(".apply").addEventListener("click", function(){
    var value = parseInt(smart_options_el.querySelector(".slider").value);
    contourSegmentation(false, value, true); 
});
smart_options_el.querySelector(".cancel").addEventListener("click", function(){
  hideSmartSelectionOptions();
  GC.shape = {};
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw();
});

/*
 * Set up handlers for the magic-target-options
 */
var magic_options_el = document.querySelector(".loom-magic-target-options");
magic_options_el.querySelector(".slider").addEventListener("change", function(){
    magicWand(GC.previous_magic_x, GC.previous_magic_y, this.value, false); 
});

magic_options_el.querySelector(".apply").addEventListener("click", function(){
    var value = parseInt(smart_options_el.querySelector(".slider").value);
    magicWand(GC.previous_magic_x, GC.previous_magic_y, value, true); 
});
magic_options_el.querySelector(".cancel").addEventListener("click", function(){
  hideMagicWandOptions();
  GC.shape = {};
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw();
});

/*
 * Set up handlers for grid-target-options
 */
var grid_options_el = document.querySelector(".loom-grid-target-options");
var grid_options_el_children = grid_options_el.querySelectorAll("input");
grid_options_el_children.forEach(el => {
    el.addEventListener("input", function(){
        changeGridDimensions(
          parseInt(grid_options_el_children[0].value),
          parseInt(grid_options_el_children[1].value),
          parseInt(grid_options_el_children[2].value)
        )
    })
});

grid_options_el.querySelector(".apply").addEventListener("click", function(){
  for (let target of GC.grid) {
    addTarget(target);
  }
  GC.grid = [];
});
grid_options_el.querySelector(".cancel").addEventListener("click", function(){
  hideGridSelectionOptions();
  grid_options_el_children.forEach(el => el.value = '');
  GC.grid = [];
  GC.shape = {};
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  draw();
});

init();

