/* 
 *
 * The Loom Viewer Class 
 *
 * */
class Viewer {
    constructor() {
        this.targets = {}; // a linear representation of the targets keyed with their frame_no
        this.fps = 30;
        this.brushing = false;
    }

    load(config_filename) {
        this.config_filename = config_filename;
        return fetch(this.config_filename)
            .then(response => response.text())
            .then(config => this.init(config));
    }

    init(config) {
        this.config = JSON.parse(config);

        let window_div = $("<div>")
            .addClass("window")
            .appendTo("body");

        window_div.on("click", this.clearParallelVideoCanvas.bind(this));

        // set the window size, video size, and parallel video size to be equal
        this.setSize(window_div);
        this.setSize("#video");
        this.setSize("#parallel_video");
        this.setSize("#parallel_video_canvas");
        this.setSize("#overlay");
        this.setupVideo("video");
        this.setupVideo("parallel_video");

        let parallel_video_el = document.querySelector("#parallel_video>video");

        parallel_video_el.addEventListener(
            "seeked",
            function() {
                var canvas = document.getElementById("parallel_video_canvas");
                var context = canvas.getContext("2d");
                var width = this.config.window.width;
                var height = this.config.window.height;
                context.drawImage(parallel_video_el, 0, 0, width, height);
                var pixels = context.getImageData(0, 0, width, height);

                pixels = this.removeMagenta(pixels);

                context.putImageData(pixels, 0, 0);
            }.bind(this)
        );

        // ...

        this.setup();
        this.setupLoomMenu("#loom-menu");
    }

    removeMagenta(pixels) {
        function fastSimilar(a, b) {
            if (Math.abs(a - b) < 20) {
                return true;
            }
            return false;
        }

        for (var i = 0; i < pixels.data.length; i += 4) {
            var r = pixels.data[i + 0],
                g = pixels.data[i + 1],
                b = pixels.data[i + 2];

            if (fastSimilar(r, 255) && fastSimilar(g, 0) && fastSimilar(b, 255)) 
            {
                pixels.data[i + 3] = 0;
            } 
            else 
            {
                var magenta = [60.3199336, 98.254218, -60.842984];
                var other = rgb2lab([r, g, b]);
                if (deltaE(magenta, other) < 17) 
                {
                    pixels.data[i + 3] = 0;
                }
            }
        }
        return pixels;
    }

    setupLoomMenu(element)
    {
        let menu_width = 120;
        $(element)
            .attr("width", menu_width)
            .attr("height", this.config.window.height)
            .css({
                position: "absolute",
                top: 0,
                left: this.config.window.width,
                width: menu_width,
                height: this.config.window.height
            });

        this.drawMinimap();
    }

    setupVideo(element) {
        let video = videojs(element).ready(function() {
            var player = this;
            videojs.options.children.loadingSpinner = false;
            player.play();
            player.pause();
            player.currentTime(0 / 29);

            player.off("click");
            player.on("click", function(ev) {
                ev.preventDefault();
            });
        });
    }

    chooseCursor(target, element)
    {
        var cursor = "auto";
        if (target.actor == 'hover' || target.actor == 'brush')
            cursor = 'cell';
        else if (target.actor == 'button')
            cursor = 'pointer';
        else if (target.actor == 'slider' || target.actor == 'horizontal-scroll')
            cursor = 'ew-resize'
        else if (target.actor == 'arcball')
            cursor = 'alias'
        else if (target.actor == 'vertical-slider' || target.actor == 'vertical-scroll')
            cursor = 'ns-resize'

        // check if the element is a raw DOM el
        // or a jQuery element
        if (element.hasOwnProperty("context") && typeof(element.context) != 'undefined')
        {
            element.context.style.cursor = cursor;
        }
        else if (typeof(element.css) !== 'undefined')
        {
            element = element.css("cursor", cursor);
        }
        return element;
    }

    createInteractionHandler(target) 
    {
        // Wrapper wraps the svg. In the case of circles and rectangles
        // wrapper is also the event handler. In case of polygons,
        // wrapper > svg > polygon will be the event handler. 
        // Wrapper is the div that stores the data-frame property.
        let wrapper; 
        if (target.shape.type == "rect") 
        {
            wrapper = $("<div>")
                .addClass("loom-target")
                .appendTo("body")
                .css({
                    position: "absolute",
                    left: target.shape.x,
                    top: target.shape.y,
                    width: target.shape.width,
                    height: target.shape.height,
                });

            var centerX = target.shape.left + target.shape.width / 2.0;
            var centerY = target.shape.top + target.shape.height / 2.0;

            this.chooseCursor(target, wrapper);
        } 
        else if (target.shape.type == "circ") 
        {
            wrapper = $("<div>")
                .addClass("loom-target")
                .appendTo("body")
                .css({
                    position: "absolute",
                    left: target.shape.centerX - target.shape.radius,
                    top: target.shape.centerY - target.shape.radius,
                    width: 2 * target.shape.radius,
                    height: 2 * target.shape.radius,
                    borderRadius: "50%"
                });

            this.chooseCursor(target, wrapper);
        }

        else if (target.shape.type == "poly") 
        {
            let w,
                h,
                topOffset,
                leftOffset,
                minX = 100000,
                minY = 100000,
                maxX = -1,
                maxY = -1,
                polyString = "";
            for (let i = 0; i < target.shape.points.length; i++) {
                let x = target.shape.points[i].x;
                let y = target.shape.points[i].y;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            for (let i = 0; i < target.shape.points.length; i++) {
                let x = target.shape.points[i].x;
                let y = target.shape.points[i].y;
                polyString += x - minX + "," + (y - minY);
                if (i !== target.shape.points.length - 1) polyString += " ";
            }
            w = maxX - minX;
            h = maxY - minY;
            topOffset = minY;
            leftOffset = minX;
            wrapper = $("<div>")
                .addClass("loom-target")
                .appendTo("body")
                .css({
                    position: "absolute",
                    top: topOffset,
                    left: leftOffset,
                    width: w,
                    height: h,
                });

            let svg = $(
                document.createElementNS("http://www.w3.org/2000/svg", "svg")
            );
            svg.attr({
                width: w,
                height: h
            });
            let polygon = $(
                document.createElementNS("http://www.w3.org/2000/svg", "polygon")
            );
            polygon.attr({
                points: polyString,
                fill: "transparent",
                strokeWidth: 5,
            });
            polygon = this.chooseCursor(target, polygon);
            polygon.appendTo(svg);
            svg.appendTo(wrapper);
        }

        wrapper.attr("data-frame", target.frame_no.toString());
        return wrapper;
    }

    drawMinimap()
    {
        var canvas = document.querySelector(".minimap");
        var width = 100;
        var ratio = 1.0 * width / this.config.window.width;
        var height = this.config.window.height * ratio;

        canvas.width = width;
        canvas.height = height;

        var context = canvas.getContext("2d");
        context.fillStyle = "#cccccc";
        context.fillRect(0, 0, width, height);

        // draw a mini version of every target
        context.fillStyle = "#aaaaaa";
        for (var i in this.targets)
        {
            var target = this.targets[i];
            if (this.findChild(target, this.current_state) == null &&
                this.findSibling(target, this.current_state) == null &&
                target.parent != "root")
            {
                continue;
            }

            if (target.shape.type == "rect")
            {
                context.fillRect(
                    target.shape.x * ratio, 
                    target.shape.y * ratio, 
                    target.shape.width * ratio, 
                    target.shape.height * ratio
                );
            }

            if (target.shape.type == "circ")
            {
                context.beginPath();
                context.arc(target.shape.centerX * ratio, 
                    target.shape.centerY * ratio, 
                    target.shape.radius * ratio,
                    0, 
                    2 * Math.PI);
                context.fill();
            }

            if (target.shape.type == "poly")
            {
                context.beginPath();
                context.moveTo(target.shape.points[0].x * ratio, target.shape.points[0].y * ratio);
                for (var j = 1; j < target.shape.points.length; j++) 
                {
                    context.lineTo(target.shape.points[j].x * ratio, 
                        target.shape.points[j].y * ratio);
                }
                context.closePath();
                context.fill();
            }
        }
    }

    gotoRoot()
    {
        var frame = 0;
        this.current_state = this.config;
        let video = videojs("video"); // video layer to change
        video.currentTime((frame + 1) / this.fps);
    }

    changeStateWithFrameNo(frame, video_name, offset)
    {
        if (typeof offset == "undefined") {
            offset = 0;
        }

        let target = this.targets[frame];
        if (
            this.findChild(target, this.current_state) != null ||
            this.findSibling(target, this.current_state) != null ||
            this.findChild(target, this.config) != null ||
            target.name == "root"
        ) {
            this.current_state = target;
            let video = videojs(video_name); // video layer to change
            video.currentTime((frame + 1 + offset) / this.fps);
        }

        $(".loom-target").each(function() {
            $(this).css("z-index", 100);
        });
        if (this.current_state.hasOwnProperty("children")) {
            for (var i = 0; i < this.current_state.children.length; i++) {
                let frame = this.current_state.children[i].frame_no;
                $(".loom-target[data-frame=" + frame + "]").each(function() {
                    $(this).css("z-index", 1000);
                });
            }
        } else {
            /*let frame = this.current_state.frame_no;
            $(".loom-target[data-frame=]" + frame + "]").each(function(){
                $(this).css("z-index", 1000);
            });*/
        }

        // update the minimap
        this.drawMinimap();
    }

    // determine if state can change and change it if it can
    changeState(target_el, video_name, offset) {
        video_name = "video";
        if (typeof offset == "undefined") {
            offset = 0;
        }

        // frame for this interaction
        let frame = parseInt($(target_el).attr("data-frame"));
        console.log("Frame", frame, "for", video_name);

        this.changeStateWithFrameNo(frame, video_name, offset);
    }

    // tries to find a target state in the immediate children of another
    // based on its frame number
    findChild(needle, haystack) {
        if (!haystack.hasOwnProperty("children")) {
            // then it's a leaf node
            return null;
        }
        for (var i = 0; i < haystack.children.length; i++) {
            if (haystack.children[i].frame_no == needle.frame_no) {
                return haystack.children[i];
            }
        }
        return null;
    }

    // tries to find a target state (needle) in the siblings of
    // another (other) based on its frame number
    findSibling(needle, other) {
        // find parent first so we can access the children
        let par;
        if (other.parent == "root")
        {
            par = this.config;
        }
        else
        {
            par = this.findByName(other.parent); 
        }
        if (par == null || !par.hasOwnProperty("children")) {
            return null;
        }

        for (var i = 0; i < par.children.length; i++) {
            if (par.children[i].frame_no == needle.frame_no) {
                return par.children[i];
            }
        }
        return null;
    }

    // finds a target by its name
    findByName(name) {
        for (var i in this.targets) {
            if (this.targets[i]["name"] == name) {
                return this.targets[i];
            }
        }
        return null;
    }

    findByDescription(term)
    {
        var options = {
            shouldSort: true,
            tokenize: true,
            threshold: 0.3,
            location: 0,
            distance: 100,
            maxPatternLength: 32,
            minMatchCharLength: 1,
            keys: [
                "description",
                "name"
            ]
        };

        var results = [];
        for (var i in this.targets)
        {
            var fuse = new Fuse([this.targets[i]], options); 
            var result = fuse.search(term);
            if (Object.keys(result).length > 0)
            {
                var key = Object.keys(result)[0];
                results.push(result[key]);
            }
        }
        return results;
    }

    getEventHandlingElement(target_type, wrapper)
    {
        let handler;
        if (target_type == "poly") 
        {
            handler = wrapper.find("svg").find("polygon");
        }
        else
        {
            handler = wrapper;
        }
        return handler;
    }

    traverse(target) {
        if (target.name != "root") {
            let wrapper = this.createInteractionHandler(target);
            let handler = this.getEventHandlingElement(target.shape.type, wrapper);
            this.targets[target.frame_no] = target;

            if (target.type == "parallel" && target.actor == "button") 
            {
                handler.on("click", function(e) {
                    let arg = e.currentTarget;
                    if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
                    this.changeState(arg, "parallel_video");
                }.bind(this));
            }

            if (target.type == "linear" && target.actor == "button") 
            {
                handler.on( "click", function(e) {
                    let arg = e.currentTarget;
                    this.clearParallelVideoCanvas();
                    if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
                    this.changeState(arg, "video");
                }.bind(this));

                // this target isn't responsible for a mouseover
                // hide it and send another event in case there's something under this 
                // element
                //
                // MOA::Bug(Jan 21st 2019) Mouseover will also get called on a button, there has to be a way to distinguish the hover from the click
                // 
                handler.on("mouseover", function(e){
                    var target = e.currentTarget;
                    console.log(e);
                    if (e.target.tagName == "polygon") 
                    {
                        target = e.currentTarget.parentElement.parentElement;
                    }

                    target.style.display = "none"; 
                    var temp_event = new Event('mouseover');

                    // the alternative element under the previous target
                    var alt_target = document.elementFromPoint(e.pageX, e.pageY);
                    alt_target.dispatchEvent(temp_event);
                    target.style.display = "block";
                });
            }

            if (target.type == "linear" && target.actor == "hover") {
                handler.on( "mouseover", function(e) {
                    let arg = e.currentTarget;
                    this.clearParallelVideoCanvas();
                    if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
                    this.changeState(arg, "video", 0);
                }.bind(this));

                // this target isn't responsible for a click
                // hide it and send another event in case there's something under this 
                // element
                handler.on("click", function(e){
                    var target = e.currentTarget;
                    console.log(e);
                    if (e.target.tagName == "polygon") 
                    {
                        target = e.currentTarget.parentElement.parentElement;
                    }

                    target.style.display = "none"; 
                    var temp_event = new Event('click');

                    // the alternative element under the previous target
                    var alt_target = document.elementFromPoint(e.pageX, e.pageY);
                    alt_target.dispatchEvent(temp_event);
                    target.style.display = "block";
                });
            }

            if (target.type == "linear" && target.actor == "slider") {
                handler.on("mousemove", function(e) {
                    let arg = e.currentTarget;
                    if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
                    var target_offset = $(arg).offset();
                    var target_width = $(arg).outerWidth();
                    var rel_x = e.pageX - target_offset.left;
                    var step_size = target_width / 10;
                    var offset = rel_x / step_size;

                    this.clearParallelVideoCanvas();
                    this.changeState(arg, "video", offset);
                }.bind(this));
            }

            if (target.type == "linear" && target.actor == "brush") {
                handler.on("mousedown", function(e) {
                    let arg = e.currentTarget;
                    var target_offset = $(arg).offset();
                    var target_width = $(arg).outerWidth();

                    var rel_x = e.pageX - target_offset.left;
                    var rel_y = e.pageY - target_offset.top;
                    this.brushing = true;
                    this.brushing_start_x = rel_x;
                    this.brushing_start_y = rel_y;
                }.bind(this));
                
                handler.on("mouseup", function(e){
                    this.brushing = false;
                }.bind(this));

                handler.on("mousemove", function(e){
                    if (this.brushing == false)
                        return;

                    let arg = e.currentTarget;
                    var target_offset = $(arg).offset();
                    var target_width = $(arg).outerWidth();
                    var target_height = $(arg).outerHeight();

                    let brushing_end_x = (e.pageX - target_offset.left);
                    let brushing_end_y = (e.pageY - target_offset.top);

                    let interval = 4; // the same as the one in interact.py - should be dynamic later

                    let step_x = target_width / interval;
                    let step_y = target_height / interval;
                    let coord_x = Math.round(this.brushing_start_x / step_x) ;
                    let coord_y = Math.round(this.brushing_start_y / step_y) ;

                    let coord_w = Math.round((brushing_end_x - this.brushing_start_x) / step_x);
                    let coord_h = Math.round((brushing_end_y - this.brushing_start_y) / step_y);

                    let dim_x = interval;
                    let dim_y = interval;
                    let dim_w = interval;
                    let dim_h = interval;

                    let offset = coord_h + coord_x * interval**3 + 
                        coord_w * interval +
                        coord_y * interval ** 2; 
                    
                    var temp = {
                        coord_x: coord_x,
                        coord_y: coord_y,
                        coord_w: coord_w, 
                        coord_h: coord_h,
                        offset: offset
                    };
                    console.log(temp);

                    this.clearParallelVideoCanvas();
                    this.changeState(arg, "video", offset);
                }.bind(this));
            }

            if (target.type == "linear" && target.actor == "drag") {
                handler.on("mousemove", function(e) {
                    let arg = e.currentTarget;
                    if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
                    var target_offset = $(arg).offset();
                    var target_height = $(arg).outerHeight();
                    var rel_y = e.pageY - target_offset.top;
                    var step_size = target_height / 10;
                    var offset = rel_y / step_size;

                    this.clearParallelVideoCanvas();
                    this.changeState(e.currentTarget, "video", offset);
                }.bind(this));
            }

            if (target.type == "linear" && target.actor == "arcball") {
                var self = this;
                var arcball = $(handler).ArcballManager({
                    width: target.shape.width,
                    height: target.shape.height,
                    frame_offset: parseInt(target["frame_no"]),
                    interaction_callback: function() {
                        self.changeState(handler[0], "video");
                        self.clearParallelVideoCanvas();
                    }
                });
            }
        }

        if (target.hasOwnProperty("children")) {
            for (var i = 0; i < target.children.length; i++) {
                this.traverse(target.children[i]);
            }
        }
    }

    setup()
    {
        this.current_state = this.config;
        this.traverse(this.config);
    }

    clearParallelVideoCanvas() 
    {
        let canvas = document.getElementById("parallel_video_canvas");
        let context = canvas.getContext("2d");
        context.clearRect(
            0,
            0,
            this.config.window.width,
            this.config.window.height
        );
    }

    setSize(element) {
        $(element)
            .attr("width", this.config.window.width)
            .attr("height", this.config.window.height)
            .css({
                position: "absolute",
                top: 0,
                left: 0,
                width: this.config.window.width,
                height: this.config.window.height
            });
    }
}

let viewer = null;
$(document).ready(function() {
    viewer = new Viewer();
    viewer.load("config.json");

    document.querySelector(".btn-helper").addEventListener("click", function(){
        overlay.classList.toggle("hide");

        var all_polygons = document.querySelectorAll(".loom-target svg polygon");
        all_polygons.forEach(function(poly){
            var handler = poly.parentElement.parentElement;
            var target = viewer.targets[parseInt(handler.getAttribute("data-frame"))];
            var current = viewer.current_state;
            if (viewer.findChild(target, current) == null && 
                viewer.findSibling(target, current) == null &&
                target.parent != "root")
            {
                return;
            }
            poly.classList.toggle("highlight");
        });

        $(".loom-target:empty").each(function(){
            var target = viewer.targets[parseInt(this.getAttribute("data-frame"))];
            var current = viewer.current_state;
            if (viewer.findChild(target, current) == null && 
                viewer.findSibling(target, current) == null &&
                target.parent != "root")
            {
                return;
            }
            this.classList.toggle("highlight");
        });

    })

    // when the search input changes
    $(".input-search").on("input", function(){
        $(".search-results-table tbody").html("");
        var term = $(this).val();
        var results = viewer.findByDescription(term);
        if (results.length > 0)
        {
            for (var i in results)
            {
                var row = "<tr><td>" + results[i].name + "</td></tr>";
                $(".search-results-table tbody").append(row);
            }
        }
        else
        {
            $(".search-results-table tbody").append("<tr><td></td></tr>");
        }
    });

    // handle clicking on the search results
    $(".search-results-table tbody").on("click", "td", function(){
        var name = this.innerHTML
        var target = viewer.findByName(name); 
        if (target.parent == "root")
        {
            viewer.gotoRoot();
        }
        else
        {
            var parent = viewer.findByName(target.parent);
            viewer.changeStateWithFrameNo(parent.frame_no, "video");
        }

        // give a hint about the whereabouts of the target
        var el = $(".loom-target[data-frame=" + target.frame_no + "]");
        console.log(target, el);

        var options = {
            'effect': 'drops',
            'effectOptions': {
                'color': 'rgba(0,0,255,0.5)',
                'radius': 100
            }
        };
        el.twinkle(options);
    });
});

