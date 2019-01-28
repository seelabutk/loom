;(function ($, window){

    $.fn.ArcballManager= function(options)
    {
        if (options === undefined || typeof options === 'object')
        {
            return this.each(function(){
                if (!$.data(this, "ArcballManager"))
                {
                    $.data(this, "ArcballManager", new ArcballManager(this, options));
                }   
            }); 
        }

        // TODO:If the options is a string then expose the plugin's methods
    }

    function ArcballManager(element, options)
    {
        this.element = element;
        this.settings = $.extend({}, $.fn.ArcballManager.settings, options);
        this.init();
    }


    ArcballManager.prototype.init = function()
    {
        this.camera = null;
        this.is_drag = false;
        this.pitch = 0;
        this.yaw = 0;
        this.video = videojs("video");

        $(this.element).attr("width", this.settings.width);
        $(this.element).attr("height", this.settings.height);

        $(this.element).css("width", this.settings.width.toString() + "px");
        $(this.element).css("height", this.settings.height.toString() + "px");

        // First render
        this.setup_camera();
        this.setup_handlers();
    }

    ArcballManager.prototype.setup_camera = function(position, up)
    {
        this.camera = new ArcBall();
        this.camera.up = (typeof up !== 'undefined' ? up : $V([0, 1, 0, 1.0]));
        this.camera.position = (typeof position !== 'undefined' ? position : $V([0, 0, this.settings.zoom, 1.0]));

        this.camera.setBounds(this.settings.width, this.settings.height);
        this.camera.zoomScale = this.camera.position.elements[2];
    }

    ArcballManager.prototype.getCameraInfo = function()
    {
        var m = $M(this.camera.Transform);
        m = m.inverse();

        var new_camera_position = m.multiply(this.camera.position);
        var new_camera_up = m.multiply(this.camera.up);

        var x = new_camera_position.elements[0];
        var y = new_camera_position.elements[1];
        var z = new_camera_position.elements[2];

        var upx = new_camera_up.elements[0];
        var upy = new_camera_up.elements[1];
        var upz = new_camera_up.elements[2];

        return { position: new_camera_position.elements, up: new_camera_up.elements };
    }

    ArcballManager.prototype.render = function(lowquality, remote_call)
    {
        var new_position = $V(this.getCameraInfo()['position']);
        var angles = this.camera.getAngles(new_position); 
        var index = this.translateAnglesToFrame(angles.yaw, angles.pitch, angles.roll);

        var zoom_offset = Math.abs(this.camera.zoomScale - 512) / 300;
        var one_zoom_worth = 684; 

        var frame = (index + 1) % 500 + this.settings.frame_offset;
        frame = frame / 30;
        console.log("Frame: ", frame * 30); 
        this.video.currentTime(frame);
    }

    ArcballManager.prototype.translateAnglesToFrame = function(yaw, pitch, roll)
    {
        yaw = 360 - yaw;
        //yaw = (yaw) % 360;
        var yaw_index = Math.floor(yaw / 14.4);

        
        pitch += 90;
        pitch = Math.max(pitch, 0);
        pitch = Math.min(pitch, 171);
        var pitch_index = Math.floor(pitch / 9);
        var index = yaw_index * 180 / 9 + pitch_index;
        return index;
    }

    ArcballManager.prototype.setAngles = function(yaw, pitch, roll)
    {
        var index = this.translateAnglesToFrame(yaw, pitch, roll);
        var frame = (index + 1) % 500 + this.settings.frame_offset;
        frame = frame / 30;
        //console.log("Frame: ", frame); 
        this.video.currentTime(frame);
    }

    ArcballManager.prototype.rotate = function(mouse_x, mouse_y, lowquality)
    {
        if (this.is_drag)
        {
            this.is_drag = false;
            this.camera.move(mouse_x, mouse_y);
            this.render(lowquality);
            this.is_drag = true;
        }
    }
    
    ArcballManager.prototype.setup_handlers = function()
    {
        var self = this;
        $(this.element).on("mousedown", function(){
            self.settings.interaction_callback();
            self.is_drag = true;

            self.camera.LastRot = self.camera.ThisRot;
            self.camera.click(event.clientX - self.element.getBoundingClientRect().left, event.clientY - self.element.getBoundingClientRect().top);

            return false;
        });

        $(this.element).on("mousemove", function(){
            var mouse_x = event.clientX - self.element.getBoundingClientRect().left;
            var mouse_y = event.clientY - self.element.getBoundingClientRect().top;
            self.rotate(mouse_x, mouse_y, 1); // Render low quality version
        });

        $(this.element).on("mouseup", function(event){
            var mouse_x = event.clientX - self.element.getBoundingClientRect().left;
            var mouse_y = event.clientY - self.element.getBoundingClientRect().top;

            self.rotate(mouse_x, mouse_y, 0); // Render high quality version
            self.is_drag = false;
            return false;
        });
        
        $(this.element).on("dragstart", function(event){
            event.preventDefault();
        });

        $(this.element).on("mousewheel", function(event){
            if (self.settings.enableZoom == false)
                return false;
            var mag = event.originalEvent.wheelDeltaY;
            self.camera.zoomScale += (mag / Math.abs(mag)) * 300;//event.originalEvent.wheelDeltaY * 0.1;
            self.camera.position.elements[2] = self.camera.zoomScale;
            self.render(1);

            clearTimeout($.data(self, 'timer'));
            $.data(self, 'timer', setTimeout(function() {
                self.render(0);
            }, 1000));
            return false;
        });

        /* 
         * Touch event handlers
         */
        $(this.element).on("touchstart", function(event){
            self.is_drag = true;

            //update the base rotation so model doesn't jerk around upon new clicks
            self.camera.LastRot = this.camera.ThisRot;

            //tell the camera where the touch event happened
            self.camera.click(event.originalEvent.touches[0].clientX - 
                    self.element.getBoundingClientRect().left, event.originalEvent.touches[0].clientY - 
                    self.element.getBoundingClientRect().top);

            return false;
        });

        //handle touchEnd
        $(this.element).on("touchend", function(event){
            self.is_drag = false;

            self.render(0);
            return false;
        });

        //handle touch movement
        $(this.element).on("touchmove", function(event){
            if (self.is_drag == true)
            {
                mouse_x = event.originalEvent.touches[0].clientX - self.element.getBoundingClientRect().left;
                mouse_y = event.originalEvent.touches[0].clientY - self.element.getBoundingClientRect().top;

                self.rotate(mouse_x, mouse_y, 1); // Render low quality version
            }
            return false;
        });

    }

    /*
     * Default settings for a ArcballManager object
     */
    $.fn.ArcballManager.settings = {
        host: "",
        width: 512,
        height: 512,
        zoom: 512,
        enable_zoom: true,
        enable_rotation: true,
    };

}(jQuery, window));
