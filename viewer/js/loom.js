class Viewer
{
    constructor()
    {
        this.targets = {}; // a linear representation of the targets
        /*fetch(config_filename)
            .then(response => response.text())
            .then(configs => this.configs = configs)*/
        //this.init(this.configs);
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

        var self = this;
        parallel_video_el.addEventListener("seeked", function(){
            var canvas = document.getElementById("parallel_video_canvas");
            var context = canvas.getContext("2d");
            var width = self.config.window.width;
            var height = self.config.window.height;
            context.drawImage(parallel_video_el, 0, 0, width, height);
            var pixels = context.getImageData(0, 0, width, height);

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
            context.putImageData(pixels, 0, 0);
        });

        // ...

        this.setup();
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

    traverse(target)
    {
        if (target.name != 'root')
        {
            var fps = 29;
            if (target.type == 'parallel' && target.actor == 'button')
            {
                let handler = this.createInteractionHandler(target);
                this.targets[target.frame_no] = handler;
                handler.on("click", function(){
                    let frame = parseInt($(this).attr("data-frame"));
                    let video = videojs("parallel_video");
                    video.currentTime(frame / fps);
                });
            }
            if (target.type == 'linear' && target.actor == 'button')
            {
                let handler = this.createInteractionHandler(target);
                this.targets[target.frame_no] = handler;
                handler.on("click", function(){
                    let frame = parseInt($(this).attr("data-frame"));
                    let video = videojs("video");
                    video.currentTime(frame / fps);
                });
            }
            if (target.type == 'linear' && target.actor == 'hover')
            {
                let handler = this.createInteractionHandler(target);
                this.targets[target.frame_no] = handler;
                handler.on("mouseover", function(){
                    let frame = parseInt($(this).attr("data-frame"));
                    let video = videojs("video");
                    video.currentTime(frame / fps);
                });
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

$(document).ready(function(){
    let viewer = new Viewer();
    viewer.load("config.json");
});
