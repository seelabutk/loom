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


win.removeAllListeners();

var interactor = null;
var selection = "Rectangle";

function execute(command, callback) {
  console.log(command);
  let spawn = require("child_process").spawn;
  let commands = command.split(" ");
  let process = spawn(commands.splice(0, 1)[0], commands);

  process.stdout.on("data", function(data) {
    console.log(new TextDecoder("utf-8").decode(data));
  });
  process.stderr.on("data", function(data) {
    console.log(new TextDecoder("utf-8").decode(data));
  });
  process.on("exit", function(code) {
    console.log(code);
  });
}

// setup the menu
var menu = Menu.buildFromTemplate([
  {
    label: "Menu",
    submenu: [
      {
        label: "Save",
        accelerator: "CmdOrCtrl+S",
        click: function() {
          fs.writeFile(
            "./viewer/config.json",
            JSON.stringify(prepareSave(targets)),
            () => {}
          );
        }
      },
      {
        label: "Run",
        accelerator: "CmdOrCtrl+R",
        click: function() {
          let delay = document.getElementById('delay').value;
          delay = (!isNaN(parseFloat(delay)) && isFinite(delay)) ? ' ' + delay : ' 250';
          console.log(delay); 
          let cmd =
            process.platform === "win32"
              ? "python interact.py ./viewer/config.json"
              : "interact.py ./viewer/config.json";
          interactor = execute(cmd + delay, function(output) {
            console.log(output);
          });
        }
      },
      {
        label: "Stop",
        accelerator: "CmdOrCtrl+K",
        click: function() {
          if (interactor !== null) {
            interactor.kill();
          }
        }
      },
      {
        label: "Export Video",
        accelerator: "CmdOrCtrl+E",
        click: function() {
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

var template = document.getElementById("tmpl-menu").innerHTML;
Mustache.parse(template);
var stats_template = document.getElementById("tmpl-stats").innerHTML;
Mustache.parse(stats_template);

var canvas = document.getElementById("canvas");
canvas.width = document.body.clientWidth;
canvas.height = document.body.clientHeight - 15;

targets = []; // all targets in a list
var ctx = canvas.getContext("2d"),
  rect = null, // global temp rectangle for dragging and drawing rectangles
  circ = null,
  poly = null,
  target_counter = 0, // used as a unique identifier for the target IDs
  drag = false;

function init() {
  canvas.addEventListener("mousedown", mouseDown, false);
  canvas.addEventListener("mouseup", mouseUp, false);
  canvas.addEventListener("mousemove", mouseMove, false);

  var win = electron.remote.getCurrentWindow();
  win.on("move", function() {
    setStats();
  });

  setStats();
  document
    .getElementById("shape-selection")
    .addEventListener("change", selectionChange);

  win.on("resize", function() {
    var dimensions = win.getBounds();
    canvas.width = dimensions.width;
    canvas.height = dimensions.height - 15;
  });
}

function setStats() {
  var stats = document.getElementById("stats-render");
  var position = win.getPosition();
  stats.innerHTML = Mustache.render(stats_template, {
    x: position[0],
    y: position[1]
  });
}

function selectionChange() {
  selection = document.getElementById("shape-selection").value;
}

function mouseDown(e) {
  if (selection == "Rectangle") {
    rect = { type: "rect" };
    rect.startX = e.pageX - this.offsetLeft;
    rect.startY = e.pageY - this.offsetTop;
    drag = true;
  } else if (selection == "Circle") {
    circ = { type: "circ" };
    circ.startX = e.pageX - this.offsetLeft;
    circ.startY = e.pageY - this.offsetTop;
    drag = true;
  } else if (selection == "Polygon") {
    if (poly == null) {
      poly = { type: "poly" };
      poly.points = [];
    }
    let point = { x: e.pageX - this.offsetLeft, y: e.pageY - this.offsetTop };
    if (poly.points[0]) {
      if (
        Math.abs(point.x - poly.points[0].x) <= 10 &&
        Math.abs(point.y - poly.points[0].y) <= 10
      ) {
        point.x = poly.points[0].x;
        point.y = poly.points[0].y;
        poly.points.push(point);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        draw(e, true);
        addMenu(JSON.parse(JSON.stringify(poly)));
        drag = false;
        poly = null;
        return;
      }
    }
    poly.points.push(point);
    drag = true;
  }
}

function mouseUp(e) {
  if (selection !== "Polygon") drag = false;
  if (selection == "Rectangle") {
    if (rect.w == 0 && rect.h == 0) return;
    addMenu(JSON.parse(JSON.stringify(rect)));
  } else if (selection == "Circle") {
    if (
      Math.abs(circ.startX - circ.endX) <= 7 ||
      Math.abs(circ.startY - circ.endY) <= 7
    )
      return;
    addMenu(JSON.parse(JSON.stringify(circ)));
  }
  rect = null;
  circ = null;
  //ctx.clearRect(0,0,canvas.width,canvas.height);
}
function mouseMove(e) {
  if (drag) {
    if (selection == "Rectangle") {
      rect.w = e.pageX - this.offsetLeft - rect.startX;
      rect.h = e.pageY - this.offsetTop - rect.startY;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw();
    } else if (selection == "Circle") {
      circ.endX = e.pageX - this.offsetLeft;
      circ.endY = e.pageY - this.offsetTop;
      circ.midX = (circ.endX - circ.startX) / 2 + circ.startX;
      circ.midY = (circ.endY - circ.startY) / 2 + circ.startY;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw();
    } else if (selection == "Polygon") {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      draw(e);
    }
  }
}

function draw(e, done) {
  ctx.setLineDash([6]);
  ctx.strokeStyle = "rgb(200, 200, 200)";
  for (var i in targets) {
    if (targets[i].shape && targets[i].shape.type == "rect") {
      let r = targets[i].shape;
      ctx.strokeRect(r.startX, r.startY, r.w, r.h);
    } else if (targets[i].shape && targets[i].shape.type == "circ") {
      let c = targets[i].shape;
      c.rad = Math.sqrt(
        Math.pow(c.midX - c.endX, 2) + Math.pow(c.midY - c.endY, 2)
      );
      ctx.beginPath();
      ctx.arc(c.midX, c.midY, c.rad, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (targets[i].shape && targets[i].shape.type == "poly") {
      let poly = targets[i].shape;
      ctx.beginPath();
      ctx.moveTo(poly.points[0].x, poly.points[0].y);
      for (let j = 1; j < poly.points.length; j++) {
        ctx.lineTo(poly.points[j].x, poly.points[j].y);
      }
      ctx.stroke();
    }
  }

  if (rect !== null) {
    ctx.strokeRect(rect.startX, rect.startY, rect.w, rect.h);
  }
  if (circ !== null) {
    circ.rad = Math.sqrt(
      Math.pow(circ.midX - circ.endX, 2) + Math.pow(circ.midY - circ.endY, 2)
    );
    ctx.beginPath();
    ctx.arc(circ.midX, circ.midY, circ.rad, 0, 2 * Math.PI);
    ctx.stroke();
  }
  if (poly !== null) {
    ctx.beginPath();
    ctx.moveTo(poly.points[0].x, poly.points[0].y);
    for (let j = 1; j < poly.points.length; j++) {
      ctx.lineTo(poly.points[j].x, poly.points[j].y);
    }
    if (!done) {
      ctx.lineTo(e.pageX, e.pageY);
    }
    ctx.stroke();
  }
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
      polygon.push([shape.points[i].x ,shape.points[i].y]);
    }
    let center = polylabel([polygon])
    shape.centerX = center[0];
    shape.centerY = center[1];
  }
  menu.style.zIndex = 10000;
  menu.classList.add("menu");

  let id = target_counter++;
  menu.setAttribute("data-id", id);
  menu.innerHTML = Mustache.render(template, { shape: JSON.stringify(shape) });
  menu.querySelector(".showhide").addEventListener("click", function() {
    menu.querySelectorAll(".setting").forEach(function(item) {
      item.classList.toggle("hide");
    });
  });
  document.body.appendChild(menu);
  menu.querySelector(".remove").addEventListener("click", function() {
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

  menu.querySelector(".childof").addEventListener("focus", function() {
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

  menu.querySelector(".name").addEventListener("change", function() {
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

search = function(obj, name) {
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
    let ratio = window.devicePixelRatio;
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

init();
