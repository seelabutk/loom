// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const electron = require('electron');
const Mustache = require('mustache');
const fs = require('fs');
const exec = require('child_process').exec;
const Menu = electron.remote.Menu;
const MenuItem = electron.remote.MenuItem;
const win = electron.remote.getCurrentWindow();

var interactor = null;

function execute(command, callback){
    exec(command, function(error, stdout, stderr){ callback(stdout); });
};

// setup the menu
var menu = Menu.buildFromTemplate([
  {
	  label: 'Menu',
	  submenu: [
		  {
			label:'Save',
			click: function(){
				fs.writeFile('./viewer/config.json', JSON.stringify(prepareSave(targets)));
			}
	      },
		  {
			label: 'Run',
			click: function(){
				interactor = execute('./interact.py ./viewer/config.json', function(output) {
					console.log(output);
				});	
			}
		  },
          {
            label: 'Stop',
            accelerator: 'CmdOrCtrl+K',
            click: function(){
                if (interactor != null)
                {
                    interactor.kill();
                }
            }
          },
          {
            label: 'Export Video',
            click: function(){
                let width = parseInt(Math.floor(win.getBounds()['width'] / 2) * 2);
                let height = parseInt(Math.floor(win.getBounds()['height'] / 2) * 2);
                let window_size = width + ":" + height;
				execute('./generate_loom.sh ' + window_size, function(output) {
					console.log(output);
				});	
            }
          },
          {
            label: 'Developer Tools',
            accelerator: 'CmdOrCtrl+I',
            click() {
              win.webContents.openDevTools();
            }
          },
		  {
            label:'Exit',
            accelerator: 'CmdOrCtrl+Q',
            click: function() {
              electron.remote.app.quit();
            }
          }
	  ]
  }
]);
Menu.setApplicationMenu(menu);

var template = document.getElementById('tmpl-menu').innerHTML;
Mustache.parse(template);
var stats_template = document.getElementById('tmpl-stats').innerHTML;
Mustache.parse(stats_template);

var canvas = document.getElementById('canvas');
canvas.width = document.body.clientWidth;
canvas.height = document.body.clientHeight;

targets = [];                   // all targets in a list 
var ctx = canvas.getContext('2d'),
    rect = {},                      // global temp rectangle for dragging and drawing rectangles
    target_counter = 0,             // used as a unique identifier for the target IDs
    drag = false;

function init() {
  canvas.addEventListener('mousedown', mouseDown, false);
  canvas.addEventListener('mouseup', mouseUp, false);
  canvas.addEventListener('mousemove', mouseMove, false);

  var win = electron.remote.getCurrentWindow();
  win.on('move', function(){
      setStats();
  });

  setStats();

  win.on('resize', function(){
      var dimensions = win.getBounds();
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
  });
}

function setStats() {
    var stats = document.getElementById('stats');
    var position = win.getPosition();
    stats.innerHTML = Mustache.render(stats_template, 
            { x: position[0], y: position[1] }); 
}

function mouseDown(e) {
  rect = {};
  rect.startX = e.pageX - this.offsetLeft;
  rect.startY = e.pageY - this.offsetTop;
  drag = true;
}

function mouseUp() {
  drag = false;
  addMenu(JSON.parse(JSON.stringify(rect)));
  rect = null;
  //ctx.clearRect(0,0,canvas.width,canvas.height);
}
function mouseMove(e) {
  if (drag) {
    rect.w = (e.pageX - this.offsetLeft) - rect.startX;
    rect.h = (e.pageY - this.offsetTop) - rect.startY ;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    draw();
  }
}

function draw() {
    ctx.setLineDash([6]);
    ctx.strokeStyle = "rgb(200, 200, 200)";
    for (var i in targets)
    {
        var r = targets[i].rect;
	    ctx.strokeRect(r.startX, r.startY, r.w, r.h);
    }
    if (rect != null)
        ctx.strokeRect(rect.startX, rect.startY, rect.w, rect.h);
}

function addMenu(rect) {
    var menu = document.createElement('div');
    menu.style.position = "absolute";
    menu.style.left = (rect.startX + 10) + "px";
    menu.style.top = rect.startY + "px";
    menu.style.zIndex = 10000;
    menu.classList.add('menu');

    let id = target_counter++;
    menu.setAttribute('data-id', id);
    menu.innerHTML = Mustache.render(template, {rect: JSON.stringify(rect)});
    menu.querySelector(".showhide").addEventListener("click", function(){
        menu.querySelectorAll(".setting").forEach(function(item){
            item.classList.toggle("hide");
        });
    });
    document.body.appendChild(menu);
    menu.querySelector(".remove").addEventListener("click", function(){
        let id = parseInt(menu.getAttribute("data-id"));
        for (i in targets)
        {
            if (targets[i].id == id)
            {
                targets.splice(i, 1);
                menu.remove();
                break;
            }
        }
        ctx.clearRect(0,0,canvas.width,canvas.height);
        draw();
    });

    menu.querySelector(".childof").addEventListener("focus", function(){
        // remove all current options
        while(this.options.length > 0)
        {
            this.options.remove(0);
        }

        let option = document.createElement("option");
        option.innerHTML = "Child of";
        this.options.add(option);
        let id = parseInt(this.parentNode.getAttribute("data-id"));
        for (i in targets)
        {
            let target = targets[i];
            if (target.id != id)
            {
                let option = document.createElement("option");
                option.innerHTML = target.name;
                this.options.add(option);
            }
        }
    });

    menu.querySelector(".name").addEventListener("change", function(){
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

    if (targets.length > 0)
    {
        // if there are targets, copy the values from last one 
        // to simplify adding linear actors
        var last_index = targets.length - 1;
        var last_menu = targets[last_index]['menu'];
        var type = last_menu.querySelector(".type").selectedIndex;
        var actor = last_menu.querySelector(".actor").selectedIndex;
        menu.querySelector(".type").selectedIndex = type;
        menu.querySelector(".actor").selectedIndex = actor;
    }
    let name = "Target " + id;
    menu.querySelector(".name").value = name;
    targets.push({ id: id, name: name, menu: menu, rect: rect });
}

search = function(obj, name)
{
    if (obj.name == name)
    {
        return obj;
    }

    if (obj.children !== undefined && obj.children.length > 0)
    {
        for (var i = 0; i < obj.children.length; i++)
        {
            var temp = search(obj.children[i], name);
            if (temp != null)
                return temp;
        }
    }
    return null;
}

function prepareSave(targets) {
    var output = {};
    output.id = -1;
    output.name = "root";
    output.children = [];
    output.window = win.getBounds();

    var not_placed = [];
    for (i in targets)
    {
        var menu = targets[i].menu;
        var id = parseInt(menu.getAttribute("data-id"));
        var name = menu.querySelector(".name").value.toLowerCase();
        var type = menu.querySelector(".type").value.toLowerCase();
        var actor = menu.querySelector(".actor").value.toLowerCase();
        var parent = menu.querySelector(".childof").selectedOptions[0].value.toLowerCase();
        if (parent == "child of")
        {
            parent = "root";
        }
        var temp = JSON.parse(menu.querySelector(".rect").innerHTML);
        var rect = {};
        rect.x = temp.startX;
        rect.y = temp.startY; 
        rect.width = temp.w;
        rect.height = temp.h;

        var obj = {
            id: id,
            name: name,
            type: type,
            actor: actor,
            parent: parent,
            rect: rect
        };
        if (parent == "root")
        {
            output.children.push(obj);
        }
        else
        {
            not_placed.push(obj);
        }
    }

    while(not_placed.length > 0)
    {
        for (var i = 0; i < not_placed.length; i++)
        {
            var found_parent = search(output, not_placed[i].parent);
            if (found_parent != null)
            {
                if (found_parent.children === undefined)
                {
                    found_parent.children = [];
                }
                found_parent.children.push(not_placed[i]);
                not_placed.splice(i, 1);
                break;
            }
        } 
    }

    return output;
}

init();
