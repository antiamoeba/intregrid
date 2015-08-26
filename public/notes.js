$(function() {

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
            $.post("updateGeology", options, function(data) {
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
            $.post("updateGeology", options, function(data) {
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
    $(".note").each(function(index) {
        var zIndex = parseInt($(this).css("z-index"));
        if(zIndex>topz) {
            topz = zIndex;
        }
        var options = {
            id: $(this).attr("id")
        }
        requests++;
        var note = $(this);
        $.post("getNote", options, function(data) {
            note.find(".mCSB_container").html(data);
            if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="code") {
                var textarea = $("#"+note.attr("id")+"editor");
                var editor = ace.edit(note.attr("id")+"editor");
                editor.setTheme('ace/theme/solarized_dark');
                var input = textarea.prev('input[type=hidden]');
                editor.getSession().setMode('ace/mode/'+input.attr("lang"));
                editor.getSession().on('change', function() {input.val(editor.getValue());});
            }
            if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="user") {
                console.log(data);
                var configs = {
                    theme: 'snow'
                };
                var editor = $("#"+note.attr("id")+"editor");
                var quill = new Quill(editor[0], configs);
                var toolbar = $('#toolbar'+note.attr("id"));
                quill.addModule('toolbar', {container: toolbar[0]});
                quill.addModule('link-tooltip', true);
                quill.addModule('image-tooltip', true);
            }
            requests--;
        });
    });
    $(".note").mousedown(function () {
        $(this).css("z-index", ++topz);
    });
      // this is used later in the resizing demo
    window.dragMoveListener = dragMoveListener;
    var timers = [];
    var saved = [];
    var interval = 3000;
    $("[note='user']").keyup(function() {
        var note = $(this);
        var id = note.attr("id");
        clearTimeout(timers[id]);
        if(saved[id]!=false) {
            requests++;
        }
        saved[id] = false;
        if(note.find(".ql-editor").html()) {
            timers[id] = setTimeout(updateUserText, interval, note);
        }
    });
    $("[note='code']").keyup(function() {
        var note = $(this);
        var id = note.attr("id");
        clearTimeout(timers[id]);
        if(saved[id]!=false) {
            requests++;
        }
        saved[id] = false;
        if(note.find("input[type=hidden]").val()) {
            timers[id] = setTimeout(updateUserCode, interval, note);
        }
    });
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
        console.log(title);
        var options = {
            type:button.attr("type"),
            title:title,
            content:"",
            zIndex: ++topz
        }
        requests++;
        button.html("Adding...");
        $.post("createNote", options, function(data) {
            requests--;
            var note = $(data);
            $(".wrapper").append(note);
            note.find(".content").mCustomScrollbar();
            if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="code") {
                var textarea = $("#"+note.attr("id")+"editor");
                console.log(note.attr("id"));
                var editor = ace.edit(note.attr("id")+"editor");
                editor.setTheme('ace/theme/solarized_dark');
                editor.getSession().setMode('ace/mode/'+textarea.attr("lang"));
                var input = textarea.prev('input[type=hidden]');
                editor.getSession().on('change', function() {input.val(editor.getValue());});
            }
            if($("#"+note.attr("id")+"editor").length!=0&&note.attr("note")=="user") {
                var configs = {
                    theme: 'snow'
                };
                var editor = $("#"+note.attr("id")+"editor");
                var quill = new Quill(editor[0], configs);
                var toolbar = $('#toolbar'+note.attr("id"));
                quill.addModule('toolbar', {container: toolbar[0], 'link-tooltip': true,'image-tooltip': true});
            }
            note.find(".close").click(function() {
                var options = {
                    id: note.attr("id")
                }
                requests++;
                $.post("deleteNote", options, function(data) {
                    requests--;
                    note.remove();
                });
            })
            var x = note.attr("posx");
            var y = note.attr("posy");
            note.css("top", y+"%");
            note.css("left", x+"%");
            var width = note.attr("w");
            var height = note.attr("h");
            note.css("width", width+"%");
            note.css("height", height+"%");
            button.html("Add note");
            dialog.fadeOut();
        });
    });
    $(".scroller").load(function() {
        var scroller = $(this).parent();
        var button = scroller.children("button");
        var input = scroller.children("input");
        console.log(button.height());
        input.height(button.height());
    });
    $(".close").click(function() {
        var note =$(this).closest(".note");
        var options = {
            id: note.attr("id")
        }
        requests++;
        $.post("deleteNote", options, function(data) {
            requests--;
            note.remove();
        });
    });
    function updateUserText(note) {
        saved[note.attr('id')] = true;
        var options = {
            id:note.attr('id'),
            text: note.find(".ql-editor").html(),
        }
        $.post("updateUserText", options, function(data) {
            requests--;
        });
    }
    function updateUserCode(note) {
        saved[note.attr('id')] = true;
        var options = {
            id:note.attr('id'),
            text: note.find("input[name='"+note.attr('id')+"editor']").val(),
        }
        $.post("updateUserText", options, function(data) {
            requests--;
        });
    }
    $(window).on('beforeunload', function(e) {
        if(requests>0) {
            e.returnValue = "Are you sure you want to exit? Your data is still being saved.";
            return e.returnValue;
        }
    });
});