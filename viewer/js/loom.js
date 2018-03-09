class Viewer
{
    constructor()
    {
        this.targets = {}; // a linear representation of the targets
        this.fps = 29;
    }

    load(config_filename)
    {
        this.config_filename = config_filename;
        return fetch(this.config_filename)
            .then(response => response.text())
            .then(config => this.init(config));
    }

    init(config)
    {
        this.config = JSON.parse(config);

        let window_div = $("<div>")
            .addClass("window")
            .appendTo("body")

        window_div.on("click", this.clearParallelVideoCanvas.bind(this));

        // set the window size, video size, and parallel video size to be equal
        this.setSize(window_div);
        this.setSize("#video");
        this.setSize("#parallel_video");
        this.setSize("#parallel_video_canvas");
        this.setupVideo("video");
        this.setupVideo("parallel_video");

        let parallel_video_el = 
            document.querySelector("#parallel_video>video");

        parallel_video_el.addEventListener("seeked", function(){
            var canvas = document.getElementById("parallel_video_canvas");
            var context = canvas.getContext("2d");
            var width = this.config.window.width;
            var height = this.config.window.height;
            context.drawImage(parallel_video_el, 0, 0, width, height);
            var pixels = context.getImageData(0, 0, width, height);

            pixels = this.removeMagenta(pixels);

            context.putImageData(pixels, 0, 0);
        }.bind(this));

        // ...

        this.setup();
    }

    removeMagenta(pixels)
    {
        function fastSimilar(a, b)
        {
            if (Math.abs(a - b) < 20)
            {
                return true;
            }
            return false;
        }

        for (var i = 0; i < pixels.data.length; i += 4)
        {
            var r = pixels.data[i + 0],
                g = pixels.data[i + 1],
                b = pixels.data[i + 2];
            
            if (fastSimilar(r, 255) && 
                    fastSimilar(g, 0) && 
                    fastSimilar(b, 255))
            {
                pixels.data[i + 3] = 0;
            }
            else
            {
                var magenta = [60.3199336, 98.254218, -60.842984];     
                var other = rgb2lab([r, g, b]);
                if (deltaE(magenta, other) < 20)
                {
                    pixels.data[i + 3] = 0;
                }
            }
        } 
        return pixels;
    }

    setupVideo(element)
    {
        let video = videojs(element).ready(function(){
            var player = this;
            videojs.options.children.loadingSpinner = false;
            player.play();
            player.pause();
            player.currentTime(1/29);

            player.off("click");
            player.on("click", function(ev){
                ev.preventDefault();
                
            });
        });
    }
    
    createInteractionHandler(target)
    {
        let handler = $("<div>")
            .addClass("interaction-handler")
            .appendTo("body")
            .css({
                position: "absolute",
                left: target.rect.x,
                top: target.rect.y,
                width: target.rect.width,
                height: target.rect.height,
                border: "1px solid rgba(0, 0, 0, 0.0)"
            });
        handler.attr("data-frame", target.frame_no.toString());
        return handler;
    }

    // determine if state can change and change it if it can
    changeState(target_el, video_name)
    {
        let frame = parseInt($(target_el).attr("data-frame")); // frame for this interaction
        let target = this.targets[frame];
        if (this.findChild(target, this.current_state) != null 
                || this.findSibling(target, this.current_state) != null
                || this.findChild(target, this.config) != null
                || target.name == 'root')
        {
            this.current_state = target;
            let video = videojs(video_name); // video layer to change
            video.currentTime(frame / this.fps);
        }
    }

    // tries to find a target state in the immediate children of another 
    // based on its frame number
    findChild(needle, haystack)
    {
        if (!haystack.hasOwnProperty('children'))
        {
            // then it's a leaf node
            return null;
        }
        for (var i = 0; i < haystack.children.length; i++)
        {
            if (haystack.children[i].frame_no == needle.frame_no)
            {
                return haystack.children[i];
            }
        }   
        return null;
    }

    // tries to find a target state (needle) in the siblings of 
    // another (other) based on its frame number
    findSibling(needle, other)
    {
        // find parent first so we can access the children
        let par = this.findByName(other.parent);
        if (par == null || !par.hasOwnProperty('children'))
        {
            return null;
        }

        for (var i = 0; i < par.children.length; i++)
        {
            if (par.children[i].frame_no == needle.frame_no)
            {
                return par.children[i];
            }
        }
        return null;
    }

    // finds a target by its name
    findByName(name)
    {
        for (var i = 0; i < Object.keys(this.targets).length; i++)
        {
            if (this.targets[i]['name'] == name)
            {
                return this.targets[i];
            }   
        }
        return null;
    }

    traverse(target)
    {
        if (target.name != 'root')
        {
            if (target.type == 'parallel' && target.actor == 'button')
            {
                let handler = this.createInteractionHandler(target);
                this.targets[target.frame_no] = target;
                handler.on("click", function(e){
                    this.changeState(e.target, "parallel_video");
                }.bind(this));
            }
            if (target.type == 'linear' && target.actor == 'button')
            {
                let handler = this.createInteractionHandler(target);
                this.targets[target.frame_no] = target;
                handler.on("click", function(e){
                    this.clearParallelVideoCanvas();
                    this.changeState(e.target, "video");
                }.bind(this));
            }
            if (target.type == 'linear' && target.actor == 'hover')
            {
                let handler = this.createInteractionHandler(target);
                this.targets[target.frame_no] = target;
                handler.on("mouseover", function(e){
                    this.clearParallelVideoCanvas();
                    this.changeState(e.target, "video");
                }.bind(this));
            }
        }
        if (target.hasOwnProperty('children'))
        {
            for (var i = 0; i < target.children.length; i++)
            {
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
        context.clearRect(0, 0, this.config.window.width, this.config.window.height);
    }

    setSize(element)
    {
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
$(document).ready(function(){
    viewer = new Viewer();
    viewer.load("config.json");
});
