// ==UserScript==
// @name         Loom2
// @namespace    http://tampermonkey.net/
// @version      0.1
// @run-at       document-start
// @description  Loomifier
// @author       Mohammad Raji
// @match        https://bost.ocks.org/mike/hive/
// @match        http://www.findtheconversation.com/concept-map/
// @match        http://bl.ocks.org/NPashaP/raw/cd80ab54c52f80c4d84cad0ba9da72c2/eff5889494453282de12f55c47e5c11a4ca768b0/
// @match        http://www.brightpointinc.com/labs/nfl_predictions/
// @match        https://www.nytimes.com/interactive/2014/06/20/sports/worldcup/how-world-cup-players-are-connected.html?mtrref=undefined
// @match        https://seelab.eecs.utk.edu/ecamp/index.php?c=164&nf=6&timespan=all&threshold=10
// @match        https://seelab.eecs.utk.edu/ecamp/index.php?c=228&nf=6&timespan=all&threshold=10
// @match        https://seelab.eecs.utk.edu/ecamp/index.php?c=170&nf=6&timespan=all&threshold=10
// @grant        none
// ==/UserScript==

(function() {
    Element.prototype._addEventListener = Element.prototype.addEventListener;
    Element.prototype.addEventListener = function(a,b,c) {
        if(c==undefined)
            c=false;
        this._addEventListener(a,b,c);
        if(!this.eventListenerList)
            this.eventListenerList = {};
        if(!this.eventListenerList[a])
            this.eventListenerList[a] = [];
        //this.removeEventListener(a,b,c); // TODO - handle duplicates..
        this.eventListenerList[a].push({listener:b,useCapture:c});
    };

    Element.prototype.getEventListeners = function(a){
        if(!this.eventListenerList)
            this.eventListenerList = {};
        if(a==undefined)
            return this.eventListenerList;
        return this.eventListenerList[a];
    };
    Element.prototype.clearEventListeners = function(a){
        if(!this.eventListenerList)
            this.eventListenerList = {};
        if(a==undefined){
            for(var x in (this.getEventListeners())) this.clearEventListeners(x);
            return;
        }
        var el = this.getEventListeners(a);
        if(el==undefined)
            return;
        for(var i = el.length - 1; i >= 0; --i) {
            var ev = el[i];
            this.removeEventListener(a, ev.listener, ev.useCapture);
        }
    };

    Element.prototype._removeEventListener = Element.prototype.removeEventListener;
    Element.prototype.removeEventListener = function(a,b,c) {
        if(c==undefined)
            c=false;
        this._removeEventListener(a,b,c);
        if(!this.eventListenerList)
            this.eventListenerList = {};
        if(!this.eventListenerList[a])
            this.eventListenerList[a] = [];

        // Find the event in the list
        for(var i=0;i<this.eventListenerList[a].length;i++){
            if(this.eventListenerList[a][i].listener==b, this.eventListenerList[a][i].useCapture==c){ // Hmm..
                this.eventListenerList[a].splice(i, 1);
                break;
            }
        }
        if(this.eventListenerList[a].length==0)
            delete this.eventListenerList[a];
    };
    window.addEventListener("load", function(){
        all_events = [];
        configs = {};
        configs.name = "root";
        configs.id = -1;
        configs.children = [];
        var top_bar_height = window.screen.height - window.innerHeight - 24;
        configs.window = {x: window.screenX, y: window.screenY + top_bar_height, width: window.innerWidth, height: window.innerHeight};

        canvas = document.createElement("canvas");
        canvas.width = document.body.clientWidth;
        canvas.height = document.body.clientHeight;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.position = "absolute";
        canvas.style.left = 0;
        canvas.style.top = 0;
        canvas.style.pointerEvents = "none";
        document.body.appendChild(canvas);
        ctx = canvas.getContext("2d");
        counter = 0;
        function traverse(element)
        {
            if (element && element.tagName != undefined)
            {
                //element.style.fill = "red";
                //element.setAttribute("fill", "red");
                //element.style.border = "1px solid red";
                events = element.getEventListeners();
                if (Object.keys(events).length !== 0)
                {
                    if (element.tagName == "g" && element.classList.contains("node"))
                    {
                        //var circle = element.querySelector("circle");
                        var text = "Target" + counter.toString();//element.querySelector("text>tspan").innerHTML;
                        all_events.push({element: element, events: events});
                        var rect = element.getBoundingClientRect();
                        var target = {rect:
                                      {x: rect.left,
                                       y: rect.top,
                                       width: rect.width,
                                       height: rect.height
                                      }
                                     };

                        target.type="linear";
                        target.actor = "hover";
                        target.name = text;
                        target.id = counter;
                        configs.children.push(target);
                        counter += 1;
                    }
                }

                for (var i = 0; i < element.childNodes.length; i++)
                {
                    traverse(element.childNodes[i]);
                }
            }
        }
        setTimeout(function(){
            traverse(document.querySelector("svg"));

        var i = 0;
        /*
        var timer = setInterval(function(){
            var index = parseInt(i);
            var events = all_events[index].events;
            var element = all_events[index].element;
            var types = Object.keys(events);
            for (var j = 0; j < types.length; j++)
            {
                var ev = document.createEvent("SVGEvents");
                ev = document.createEvent("SVGEvents");
                ev.initEvent("mouseenter", true, false);
                //element.dispatchEvent(ev);
                //var rect = element.getBoundingClientRect();
                //var left = parseInt(rect.left) + 1;
                //var top = parseInt(rect.top) + 1;

                setTimeout(function(){
                    ev = document.createEvent("SVGEvents");
                    ev.initEvent("mouseout", true, false);
                    element.dispatchEvent(ev);
                }, 1000);
            }
            i++;
            if (i > all_events.length)
                clearInterval(timer);
        }, 2000);*/

        }, 5000);

    });

})();
