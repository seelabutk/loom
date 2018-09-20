class Viewer {
  constructor() {
    this.targets = {}; // a linear representation of the targets
    this.fps = 30;
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
        if (target.actor == 'hover')
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
        else if (element.hasOwnProperty("css"))
        {
            element = element.css("cursor", cursor);
        }
        return element;
    }

    createInteractionHandler(target) 
    {
        let handler;
        if (target.shape.type == "rect") 
        {
            handler = $("<div>")
                .addClass("interaction-handler")
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

            this.chooseCursor(target, handler);
        } 
        else if (target.shape.type == "circ") 
        {
            handler = $("<div>")
                .addClass("interaction-handler")
                .appendTo("body")
                .css({
                    position: "absolute",
                    left: target.shape.centerX - target.shape.radius,
                    top: target.shape.centerY - target.shape.radius,
                    width: 2 * target.shape.radius,
                    height: 2 * target.shape.radius,
                    borderRadius: "50%"
                });
            this.chooseCursor(target, handler);

        } else if (target.shape.type == "poly") {
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
            handler = $("<div>")
                .addClass("interaction-handler")
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
            svg.appendTo(handler);
        }

handler.attr("data-frame", target.frame_no.toString());
//handler.attr("data-frame", 0);//target.frame_no.toString());
return handler;
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

    $(".interaction-handler").each(function() {
      $(this).css("z-index", 100);
    });
    if (this.current_state.hasOwnProperty("children")) {
      for (var i = 0; i < this.current_state.children.length; i++) {
        let frame = this.current_state.children[i].frame_no;
        $(".interaction-handler[data-frame=" + frame + "]").each(function() {
          $(this).css("z-index", 1000);
        });
      }
    } else {
      /*let frame = this.current_state.frame_no;
            $(".interaction-handler[data-frame=]" + frame + "]").each(function(){
                $(this).css("z-index", 1000);
            });*/
    }
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

  traverse(target) {
    if (target.name != "root") {
      if (target.type == "parallel" && target.actor == "button") {
        let handler = this.createInteractionHandler(target);
        this.targets[target.frame_no] = target;
        if (target.shape.type == "poly") handler = handler.find("svg").find("polygon");
        handler.on(
          "click",
          function(e) {
            let arg = e.currentTarget;
            if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
            this.changeState(arg, "parallel_video");
          }.bind(this)
        );
      }
      if (target.type == "linear" && target.actor == "button") {
        let handler = this.createInteractionHandler(target);
        this.targets[target.frame_no] = target;
        if (target.shape.type == "poly") handler = handler.find("svg").find("polygon");
        handler.on(
          "click",
          function(e) {
            let arg = e.currentTarget;
            this.clearParallelVideoCanvas();
            if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
            this.changeState(arg, "video");
          }.bind(this)
        );
      }
      if (target.type == "linear" && target.actor == "hover") {
        let handler = this.createInteractionHandler(target);
        this.targets[target.frame_no] = target;
        if (target.shape.type == "poly") handler = handler.find("svg").find("polygon");
        handler.on(
          "mouseover",
          function(e) {
            let arg = e.currentTarget;
            this.clearParallelVideoCanvas();
            if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
            this.changeState(arg, "video", 0);
          }.bind(this)
        );
      }

      if (target.type == "linear" && target.actor == "slider") {
        let handler = this.createInteractionHandler(target);
        this.targets[target.frame_no] = target;
        if (target.shape.type == "poly") handler = handler.find("svg").find("polygon");
        handler.on(
          "mousemove",
          function(e) {
            let arg = e.currentTarget;
            if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
            var target_offset = $(arg).offset();
            var target_width = $(arg).outerWidth();
            var rel_x = e.pageX - target_offset.left;
            var step_size = target_width / 10;
            var offset = rel_x / step_size;

            this.clearParallelVideoCanvas();
            this.changeState(arg, "video", offset);
          }.bind(this)
        );
      }

      if (target.type == "linear" && target.actor == "drag") {
        let handler = this.createInteractionHandler(target);
        this.targets[target.frame_no] = target;
        if (target.shape.type == "poly") handler = handler.find("svg").find("polygon");
        handler.on(
          "mousemove",
          function(e) {
            let arg = e.currentTarget;
            if (e.target.tagName == "polygon") arg = $(event.target).parent().parent();
            var target_offset = $(arg).offset();
            var target_height = $(arg).outerHeight();
            var rel_y = e.pageY - target_offset.top;
            var step_size = target_height / 10;
            var offset = rel_y / step_size;

            this.clearParallelVideoCanvas();
            this.changeState(e.currentTarget, "video", offset);
          }.bind(this)
        );
      }

      if (target.type == "linear" && target.actor == "arcball") {
        let handler = this.createInteractionHandler(target);
        this.targets[target.frame_no] = target;
        if (target.shape.type == "poly") handler = handler.find("svg").find("polygon");

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

  setup() {
    this.current_state = this.config;
    this.traverse(this.config);
  }

  clearParallelVideoCanvas() {
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

  document.getElementById("test").addEventListener("click", function(){
    overlay.classList.toggle("hide");

    var all_polygons = document.querySelectorAll(".interaction-handler svg polygon");
    all_polygons.forEach(function(poly){
        var handler = poly.parentElement.parentElement;
        var target = {frame_no: handler.getAttribute("data-frame")};
        var current = viewer.current_state;
        if (viewer.findChild(target, current) == null && 
            viewer.findSibling(target, current) == null)
        {
            return;
        }
        poly.classList.toggle("highlight");
    });

    $(".interaction-handler:empty").each(function(){
        var target = {frame_no: this.getAttribute("data-frame")};
        var current = viewer.current_state;
        if (viewer.findChild(target, current) == null && 
            viewer.findSibling(target, current) == null)
        {
            return;
        }
        this.classList.toggle("highlight");
    });

  })
});
