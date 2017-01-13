$(function() {
    String.prototype.insert = function (index, string) {
      if (index > 0)
        return this.substring(0, index) + string + this.substring(index, this.length);
      else
        return string + this;
    };
    var workspace = $("#workspace").attr("workspace");
    var requests = 0;
    interact('.title').draggable({
        // enable inertial throwing
        inertia: true,
        // keep the element within the area of it's parent
        restrict: {
          restriction: $(".wrapper")[0],
          endOnly: true,
          elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
        },

        // call this function on every dragmove event
        onmove: dragMoveListener,
        // call this function on every dragend event
        onend: function (event) {
            var note = $(event.target).parent().parent();
            var options = {
                id:note.attr('id'),
                x: parseFloat(note[0].style.left),
                y: parseFloat(note[0].style.top),
                width: parseFloat(note[0].style.width),
                height: parseFloat(note[0].style.height),
                zIndex: parseInt(note.css("z-index"))
            }
            requests++;
            $.post("/updateGeology/"+workspace, options, function(data) {
                requests--;
            });
        }
    });
    interact('.note').resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        onend: function(event) {
            var note = $(event.target);
            var options = {
                id:note.attr('id'),
                x: parseFloat(note[0].style.left),
                y: parseFloat(note[0].style.top),
                width: parseFloat(note[0].style.width),
                height: parseFloat(note[0].style.height),
                zIndex: parseInt(note.css("z-index"))
            }
            requests++;
            $.post("/updateGeology/"+workspace, options, function(data) {
                requests--;
            });
        }
    }).on('resizemove', function (event) {
    	var target = $(event.target),
    	x = (parseFloat(target.attr('data-x')) || parseFloat(target[0].style.left)||0),
    	y = (parseFloat(target.attr('data-y')) || parseFloat(target[0].style.top)||0);

    	// update the element's style
    	target[0].style.width  = event.rect.width/$(".wrapper").width()*100 + '%';
    	target[0].style.height = event.rect.height/$(".wrapper").height()*100 + '%';

    	// translate when resizing from top or left edges
    	x += event.deltaRect.left/$(".wrapper").width()*100;
    	y += event.deltaRect.top/$(".wrapper").height()*100;
        target.css("position", "absolute");
    	target.css("top", y+"%");
        target.css("left", x+"%");
        // update the posiion attributes
        target.attr('data-x', x);
        target.attr('data-y', y);
        if($("#"+target.attr("id")+"editor").length>0&&target.attr("note")=="code") {
            var editor = ace.edit(target.attr("id")+"editor");
            editor.resize();
        }
    });
    function dragMoveListener (event) {
        var target = $(event.target).parent().parent(),
        	// keep the dragged position in the data-x/data-y attributes
            x = (parseFloat(target.attr('data-x')) || parseFloat(target[0].style.left)||0) + event.dx/$(".wrapper").width()*100,
            y = (parseFloat(target.attr('data-y')) || parseFloat(target[0].style.top)||0) + event.dy/$(".wrapper").height()*100;

        // translate the element
        /*target.style.webkitTransform =
        target.style.transform =
          'translate(' + x + 'px, ' + y + 'px)';*/
        target.css("top", y+"%");
        target.css("left", x+"%");
        // update the posiion attributes
        target.attr('data-x', x);
        target.attr('data-y', y);
    }
    function setNotes() {
        $(".note").each(function(index) {
            var note = $(this);
            var x = note.attr("posx");
            var y = note.attr("posy");
            note.css("top", y+"%");
            note.css("left", x+"%");
            var width = note.attr("w");
            var height = note.attr("h");
            note.css("width", width+"%");
            note.css("height", height+"%");
        });
    }
    setNotes();
    var dialog = $("#dialog");
    dialog.css("z-index", 9999);
    dialog.hide();
    $("#add").click(function () {
        if(dialog.is(":visible")) {
            dialog.fadeOut();
        }
        else {
            dialog.fadeIn();
            dialog.find(".mCSB_container").width(100+"%");
            dialog.css("z-index", topz+1000);
        };
    });
    var topz = 0;
    var quills = [];
    $(".note").each(function(index) {
        var zIndex = parseInt($(this).css("z-index"));
        if(zIndex>topz) {
            topz = zIndex;
        }
        var options = {
            id: $(this).attr("id")
        }
        var note = $(this);
        applyListeners(note);
        if(!note.hasClass("storage")) {
            requests++;
            $.post("/getNote", options, function(data) {
                note.find(".mCSB_container").html(data);
                if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="code") {
                    var textarea = $("#"+note.attr("id")+"editor");
                    var editor = ace.edit(note.attr("id")+"editor");
                    editor.setTheme('ace/theme/solarized_dark');
                    var input = textarea.prev('input[type=hidden]');
                    //editor.getSession().setMode('ace/mode/'+input.attr("lang"));
                    var ac = new AceConnection(editor, note.attr("id"));
                }
                if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="user") {
                    var configs = {
                        theme: 'snow'
                    };
                    var editor = $("#"+note.attr("id")+"editor");
                    var quill = new Quill(editor[0], configs);
                    quills[note.attr("id")] = quill;
                    var toolbar = $('#toolbar'+note.attr("id"));
                    quill.addModule('toolbar', {container: toolbar[0]});
                    quill.addModule('link-tooltip', true);
                    quill.addModule('image-tooltip', true);
                    var ce = new ConnectionEditor(quill, note.attr("id"));
                }
                requests--;
            });
        }
        else {
            requests++;
            $.post('/getStored/'+workspace, options, function(data) {
                requests--;
                note.find(".mCSB_container").html(data);
                note.find(".stored").click(function() {
                    var subnote = $(this);
                    var id = $(this).attr("linkid");
                    if(subnote.hasClass("notel")&&$("#"+id).length==0) {
                        var options2 = {
                            id: id
                        }
                        requests++;
                        $.post('/pullNote/' + workspace, options2, function(data) {
                            requests--;
                            n = showNote(data);
                            n.css("z-index", ++topz);
                        });
                    }
                });
            });
        }
        //Yay
    });
    function AceConnection(editor, noteId) {
        this.editor = editor;
        editor.$blockScrolling = Infinity;
        Editor.call(this);
        socket = new BCSocket('/channel');
        socket.send({noteId: noteId, type: "text"});
        this.lock = false;
        receiveMessage = function(onMess) {
            return function(message) {
                onMess(message);
            }
        }
        socket.onmessage = receiveMessage(this.onMessage);
        this.sendMessage = function(data) {
            socket.send(data);
        }
        this.getAceIndex = function(index) {
            var line = "";
            var session = this.editor.getSession();
            var length = session.getLength();
            var counter = 0;
            var newLine = session.getDocument().getNewLineCharacter();
            for(var i=0;i<length;i++) {
                line = session.getLine(i);
                counter += line.length;
                if(counter>=index) {
                    return {row: i, column: line.length-(counter-index)};
                }
                else {
                    counter += newLine.length;
                }
            }
            return null;
        }
        this.getAntIndex = function(change) {
            var row = change.row;
            var column = change.column;
            var index = 0;
            var session = this.editor.getSession();
            var newLine = "\n";
            for(var i=0;i<row;i++) {
                index += session.getLine(i).length;
                if(i<row) {
                    index += newLine.length;
                }
            }
            index += column;
            return index;
        }
        this.convertAceDelta = function(change) {
            var start = change.start;
            var antindex = this.getAntIndex(start);
            var delta = new Delta().retain(antindex);
            var action = change.action;
            if(action=="insert") {
                var lines = change.lines;
                var insert = "";
                for(var i=0;i<lines.length;i++) {
                    insert+=lines[i];
                    if(i<lines.length-1) {
                        insert += "\n";
                    }
                }
                delta = delta.insert(insert);
            }
            if(action=="remove") {
                var lines = change.lines;
                var remove = "";
                for(var i=0;i<lines.length;i++) {
                    remove+=lines[i];
                    if(i<lines.length-1) {
                        remove += "\n";
                    }
                }
                delta = delta.delete(remove.length);
            }
            return delta;
        }
        this.updateContents = function(data) {
            this.lock = true;
            var ops = data.ops;
            var cursor = 0;
            console.log(JSON.stringify(data));
            for(var i=0;i<ops.length;i++) {
                var op = ops[i];
                for(property in op) {
                    if(property=="insert") {
                        this.editor.getSession().insert(this.getAceIndex(cursor), op[property]);
                        cursor+=op[property].length;
                    }
                    if(property=="retain") {
                        var length = this.editor.getValue().length;
                        if(cursor+op[property]>length) {
                            var limit = cursor + op[property]-length;
                            for(var j=0;j<limit;j++) {
                                this.editor.getSession().insert(this.getAceIndex(cursor), " ");
                                cursor+=1;
                            }
                        }
                        else {
                            cursor+=op[property];
                        }
                    }
                    if(property=="delete") {
                        this.editor.getSession().remove({start:this.getAceIndex(cursor), end:this.getAceIndex(cursor+op[property])});
                    }
                }
            }
            this.lock = false;
        }
        this.setContents = function(data) {
            console.log(JSON.stringify(data));
            this.lock = true;
            this.editor.setValue("");
            this.updateContents(data);
            this.lock = false;
        }
        editor.getSession().on('change', function(e) {
            if(this.lock) return;
            console.log(JSON.stringify(e));
            console.log(JSON.stringify(this.convertAceDelta(e)));
            this.sendUpdate(this.convertAceDelta(e));
        }.bind(this));
    }
    function ConnectionEditor(editor, noteId) {
        this.editor = editor;
        Editor.call(this);
        socket = new BCSocket('/channel');
        socket.send({noteId: noteId, type: "text"});
        receiveMessage = function(onMess) {
            return function(message) {
                onMess(message);
            }
        }
        socket.onmessage = receiveMessage(this.onMessage);
        this.sendMessage = function(data) {
            socket.send(data);
        }
        this.updateContents = function(data) {
            this.editor.updateContents(data);
        }
        this.setContents = function(data) {
            this.editor.setContents(data);
        }
        editor.on('text-change', function(delta, source) {
            if(source=="user")
                this.sendUpdate(delta);
        }.bind(this));
    }
    var email = $("#email");
    $("#props").click(function() {
        if(email.val()) {
            var options = {
                email: email.val()
            };
            $.post("/shareWorkspace/"+workspace, options, function(data) {
                requests--;
                email.val("");
            });
        }
    });
      // this is used later in the resizing demo
    window.dragMoveListener = dragMoveListener;
    var timers = [];
    var saved = [];
    var interval = 3000;
    $(".scroller .item").click(function() {
        var item = $(this);
        item.siblings().removeClass("highlight");
        item.addClass("highlight");
        var button = item.closest(".scroller").siblings("button");
        button.attr("type", item.attr("type"));
    });
    $(".createcontent button").click(function() {
        var button = $(this);
        var title = button.siblings("input").val();
        var options = {
            type:button.attr("type"),
            title:title,
            content:"",
            zIndex: ++topz
        }
        requests++;
        button.html("Adding...");
        $.post("/createNote/"+workspace, options, function(data) {
            requests--;
            n = showNote(data);
            n.css("z-index", ++topz);
            button.html("Add note");
            dialog.fadeOut();
            note = $(".storage");
            requests++;
            $.post('/getStored/'+workspace, options, function(data) {
                requests--;
                note.find(".mCSB_container").html(data);
                note.find(".stored").click(function() {
                    var subnote = $(this);
                    var id = $(this).attr("linkid");
                    if(subnote.hasClass("notel")&&$("#"+id).length==0) {
                        var options2 = {
                            id: id
                        }
                        requests++;
                        $.post('/pullNote/' + workspace, options2, function(data) {
                            requests--;
                            n = showNote(data);
                            n.css("z-index", ++topz);
                        });
                    }
                });
            });
        });
    });
    $(".scroller").load(function() {
        var scroller = $(this).parent();
        var button = scroller.children("button");
        var input = scroller.children("input");
        input.height(button.height());
    });
    function showNote(html) {
        var note = $(html);
        $(".wrapper").append(note);
        note.find(".content").mCustomScrollbar();
        if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="code") {
            var textarea = $("#"+note.attr("id")+"editor");
            var editor = ace.edit(note.attr("id")+"editor");
            editor.setTheme('ace/theme/solarized_dark');
            var input = textarea.prev('input[type=hidden]');
            editor.getSession().setMode('ace/mode/'+input.attr("lang"));
            var ac = new AceConnection(editor, note.attr("id"));
        }
        if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="user") {
            var configs = {
                theme: 'snow'
            };
            var editor = $("#"+note.attr("id")+"editor");
            var quill = new Quill(editor[0], configs);
            quills[note.attr("id")] = quill;
            var toolbar = $('#toolbar'+note.attr("id"));
            quill.addModule('toolbar', {container: toolbar[0]});
            quill.addModule('link-tooltip', true);
            quill.addModule('image-tooltip', true);
            var ce = new ConnectionEditor(quill, note.attr("id"));
        }
        applyListeners(note);
        var x = note.attr("posx");
        var y = note.attr("posy");
        note.css("top", y+"%");
        note.css("left", x+"%");
        var width = note.attr("w");
        var height = note.attr("h");
        note.css("width", width+"%");
        note.css("height", height+"%");
        return note;
    }
    function applyListeners(note) {
        note.find(".close").click(function() {
            var options = {
                id: note.attr("id")
            }
            requests++;
            $.post("/storeNote/"+workspace, options, function(data) {
                requests--;
                note.remove();
            });
        });
        note.mousedown(function () {
            $(this).css("z-index", ++topz);
            var note = $(this);
            var options = {
                id:note.attr('id'),
                x: parseFloat(note[0].style.left),
                y: parseFloat(note[0].style.top),
                width: parseFloat(note[0].style.width),
                height: parseFloat(note[0].style.height),
                zIndex: parseInt(note.css("z-index"))
            }
            requests++;
            $.post("/updateGeology/"+workspace, options, function(data) {
                requests--;
            });
        });

    }
    $(window).on('beforeunload', function(e) {
        if(requests>0) {
            e.returnValue = "Are you sure you want to exit? Your data is still being saved.";
            return e.returnValue;
        }
    });
});