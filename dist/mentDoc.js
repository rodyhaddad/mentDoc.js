/*! mentDoc.js v0.5.2 24-05-2013 
The MIT License (MIT)

Copyright (c) 2013 rodyhaddad

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished
to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*!
file: mentDoc.js
*/
var mentDoc = (function() {
    var mentDoc,
        regDirectives = {}, //registered directives
        DOM_ELEMENT = 1; // nodeType
    
    function Command(el, parent) {
        this.el = el;
        this.parent = parent || null;
        this.attrs = {};
        this.children = [];
        this.data = parent ? makeInherit(parent.data) : {};
        
        this.el.style.textDecoration = "none";
        
        this.refreshAttrs();
        this.updateChildren();
    }
    
    Command.isCommandEl = function(el) {
        return (el.nodeType === DOM_ELEMENT && 
                    ( el.nodeName === "U" || el.getAttribute("you") !== null )
               );
    };
    
    Command.prototype = {
        constructor: Command,
        
        isRoot: false,
        refreshAttrs: function() {
            this.attrs = {};
            
            forEach(this.el.attributes, function(attr) {
                if (attr.specified) {
                    var name = attr.name,
                        value = this.el.getAttribute(name, 3), // 3: IE, case-sens. and String
                        normAttr = mentDoc.normalizeAttr(name);
                        
                    this.attrs[normAttr] = value;
                    
                    if (regDirectives[normAttr] && isFn(regDirectives[normAttr].encounter)) {
                        regDirectives[normAttr].encounter(this.el, value, this);
                    }
                }
            }, this);
            
            return this;
        },
        
        updateChildren: function() {
            this.children = [];
            this._loopThroughEl(this.el.childNodes);
            
            return this;
        },
        _loopThroughEl: function(childNodes) {
            forEach(childNodes, function(el) {
                if(Command.isCommandEl(el)) {
                    this.children.push(
                        new Command(el, this)
                    );
                } else if (el.nodeType === DOM_ELEMENT) {
                    this._loopThroughEl(el.childNodes);
                }
            }, this);
            
            return this;
        },
        
        execute: function() {
            forEach(this._sortedDirectives(), function(commandName) {
                if (isFn(regDirectives[commandName].execute)) {
                    regDirectives[commandName].execute(this.el, this.attrs[commandName], this);
                }
            }, this);
            
            this.executeChildren();
            
            return this;
        },
        executeChildren: function() {
            forEach(this.children, function(child) {
                child.execute();
            });
            
            return this;
        },
        
        _sortedDirectives: function() {
            var directives = [];
            forEach(this.attrs, function(value, name) {
                if (regDirectives[name]) {
                    directives.push(name);
                }
            }, this);
            
            return directives.sort(function(a, b) {
                return regDirectives[a].priority - regDirectives[b].priority;
            });
        }
    };
    
    mentDoc = {
        Command: Command,
        
        compile: function(html) {
            var elRoot;
            
            elRoot = document.createElement("u");
            elRoot.innerHTML = html;
            
            var root = new Command(elRoot);
            root.isRoot = true;
            
            return root;
        },
        
        priorityAlias: {
            "high": 10,
            "medium": 20,
            "low": 30,
            "default": 30
        },
        regDirectives: regDirectives,
        addDirective: function(name, info) {
            if (typeof info === "function") {
                info = {execute: info};
            }
            
            if (!info.priority) {
                info.priority = this.priorityAlias["default"];
            } else if (typeof info.priority === "string") {
                info.priority = this.priorityAlias[info.priority];
            }
            
            if (isNaN(info.priority)) {
                throw "Unknown priority given for directive `" + name + "` : " + info.priority;
            }
            
            regDirectives[name] = info;
        },
        
        //taken from angularjs
        //convert `data-a-b` and `x-a-b` and `a-b` to aB
        normalizeAttr: (function() {
            var PREFIX_REGEXP = /^(x[\:\-_]|data[\:\-_])/i;
            var SPECIAL_CHARS_REGEXP = /([\:\-\_]+(.))/g;
            var MOZ_HACK_REGEXP = /^moz([A-Z])/;
            
            function camelCase(name) {                  
                return name.
                    replace(SPECIAL_CHARS_REGEXP, function(_, separator, letter, offset) {
                        return offset ? letter.toUpperCase() : letter;
                    }).replace(MOZ_HACK_REGEXP, 'Moz$1');
            }
            
            return function(name) {
                return camelCase(name.replace(PREFIX_REGEXP, ''));
            };
            
        }()),
        
        forEach: forEach,
        isArray: isArray,
        isObject: isObject,
        isFn: isFn,
        makeInherit: makeInherit
    };
    
    //obj can be an Object/Array/Function
    function forEach(obj, iterator, context) {
        var key;
        if(obj && iterator) {
            context = context || obj;
            if(isFn(obj)) {
                for(key in obj) {
                    if(key != "prototype" && key != "length" && 
                        key != "name" && obj.hasOwnProperty(key)) {
                        iterator.call(context, obj[key], key);
                    }
                }
            } else if (obj.forEach && obj.forEach !== forEach) {
                obj.forEach(iterator, context);
            } else if (isArray(obj) || obj.hasOwnProperty("length")) {
                for(key = 0; key < obj.length; key++)
                    iterator.call(context, obj[key], key);
            } else {
                for(key in obj) {
                    if(obj.hasOwnProperty(key)) {
                        iterator.call(context, obj[key], key);
                    }
                }
            }
        }
        return obj;
    }
    
    function isArray(obj) {
        return Object.prototype.toString.call(obj) === "[object Array]";
    }

    function isObject(obj) {
        return typeof obj === "object" && obj !== null;
    }
    
    function isFn(fn) {
        return typeof fn === "function";
    }
    
    function makeInherit(obj) {
        if (Object.create) {
            return Object.create(obj);
        } else {
            var o = function() {};
            o.prototype = obj;
            return new o();
        }
    }
    
    return mentDoc;
}());

mentDoc.addDirective("inEl", function(el, value, command) {
    command.data.inEl = value;
});

mentDoc.addDirective("appendTo", function(el, value, command) {
    $(value, command.data.inEl).append(el.innerHTML);
});

mentDoc.addDirective("empty", {
    priority: "medium",
    execute: function(el, value, command) {
        $(value, command.data.inEl).empty();
    }
});

mentDoc.addDirective("remove", function(el, value, command) {
    $(value, command.data.inEl).remove();
});


mentDoc.markdown = {
    convertHtml: function(markdown) {
        var converter = Markdown.getSanitizingConverter(),
            lines = markdown.split(/\n/g),
            foundIndentLength = null;

        for(var i = 0; i < lines.length; i++) {
            if (foundIndentLength === null) {
                var matches = lines[i].match(/^(\s*)\S.*/);
                if (matches) {
                    foundIndentLength = matches[1].length;
                }
            } 
            if (foundIndentLength !== null) {
                lines[i] = lines[i].substring(foundIndentLength); //remove indentation
            }
        }
        markdown = lines.join("\n");
        
        Markdown.Extra.init(converter, {extensions: "all", highlighter: "prettify"});
        return converter.makeHtml(markdown);
    }
};

mentDoc.addDirective("markdown", {
    priority: "high",
    encounter: function(el, value, command) {
        el.innerHTML = mentDoc.markdown.convertHtml(
            el.innerHTML
        );
    }
});

if (typeof module !== "undefined" && module.exports) {
    module.exports.mentDoc = mentDoc;
}