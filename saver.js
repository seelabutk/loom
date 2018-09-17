const fs = require("fs");

module.exports = {
    prepare: function(targets, win)
    {
        var output = {};
        output.id = -1;
        output.name = "root";
        output.children = [];
        output.window = win.getBounds();

        var not_placed = [];
        for (let target of targets) 
        {
            var { id, name, type, actor, parent, shape } = target

            if (parent == "parent") 
            {
                parent = "root";
            }
            if (actor == "arcball-reset") 
            {
                type = "helper";
            }

            var tempShape = {};
            tempShape.type = shape.type;

            let ratio = 1; //window.devicePixelRatio;
            if (tempShape.type == "rect") 
            {
                tempShape.x = shape.startX * ratio;
                tempShape.y = shape.startY * ratio;
                tempShape.width = shape.w * ratio;
                tempShape.height = shape.h * ratio;
            } 
            else if (tempShape.type == "circ") 
            {
                tempShape.centerX = shape.midX * ratio;
                tempShape.centerY = shape.midY * ratio;
                tempShape.radius = shape.rad * ratio;
            } 
            else if (tempShape.type == "poly") 
            {
                tempShape.centerX = shape.centerX * ratio;
                tempShape.centerY = shape.centerY * ratio;
                tempShape.points = shape.points;
            }

            var obj = {
                id: id,
                name: name,
                type: type,
                actor: actor,
                parent: parent,
                shape: tempShape
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
