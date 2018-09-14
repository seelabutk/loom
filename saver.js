const fs = require("fs");

module.exports = {
    prepare: function(targets)
    {
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
            var type = "linear"; //menu.querySelector(".type").value.toLowerCase();
            var actor = menu.querySelector(".actor").value.toLowerCase();
            var parent = menu
                .querySelector(".childof")
                .selectedOptions[0].value.toLowerCase();
            if (parent == "parent") 
            {
                parent = "root";
            }
            if (actor == "arcball-reset") 
            {
                type = "helper";
            }
            var temp = JSON.parse(menu.querySelector(".shape").innerHTML);
            var shape = {};
            shape.type = temp.type;

            let ratio = 1; //window.devicePixelRatio;
            if (shape.type == "rect") 
            {
                shape.x = temp.startX * ratio;
                shape.y = temp.startY * ratio;
                shape.width = temp.w * ratio;
                shape.height = temp.h * ratio;
            } 
            else if (shape.type == "circ") 
            {
                shape.centerX = temp.midX * ratio;
                shape.centerY = temp.midY * ratio;
                shape.radius = temp.rad * ratio;
            } 
            else if (shape.type == "poly") 
            {
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
            if (parent == "root") 
            {
                output.children.push(obj);
            } 
            else 
            {
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
    },

    save: function(data)
    {
        fs.writeFile("./viewer/config.json", 
            JSON.stringify(data), 
            () => {}); 
    }
}
