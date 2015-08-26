interact('.title').draggable({
    // enable inertial throwing
    inertia: true,
    // keep the element within the area of it's parent
    restrict: {
      restriction: "parent",
      endOnly: true,
      elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
    },

    // call this function on every dragmove event
    onmove: dragMoveListener,
    // call this function on every dragend event
    onend: function (event) {
      
    }
}).resizable({
    edges: { left: true, right: true, bottom: true, top: true }
});
interact('.note').resizable({
    edges: { left: true, right: true, bottom: true, top: true }
}).on('resizemove', function (event) {
    var target = event.target,
    x = (parseFloat(target.getAttribute('data-x')) || 0),
    y = (parseFloat(target.getAttribute('data-y')) || 0);

    // update the element's style
    target.style.width  = event.rect.width + 'px';
    target.style.height = event.rect.height + 'px';

    // translate when resizing from top or left edges
    x += event.deltaRect.left;
    y += event.deltaRect.top;

    target.style.webkitTransform = target.style.transform =
    'translate(' + x + 'px,' + y + 'px)';

    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
});

function dragMoveListener (event) {
    var target = $(event.target).parent().parent()[0],
        // keep the dragged position in the data-x/data-y attributes
        x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx,
        y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;

    // translate the element
    target.style.webkitTransform =
    target.style.transform =
      'translate(' + x + 'px, ' + y + 'px)';

    // update the posiion attributes
    target.setAttribute('data-x', x);
    target.setAttribute('data-y', y);
}

  // this is used later in the resizing demo
 window.dragMoveListener = dragMoveListener;
 window.onbeforeunload = function() {
    $(".note").each(function(index) {
        var note = this;
        var options = {
            id:$(note).attr('id'),
            x: $(note).attr('data-x'),
            y: $(note).attr('data-y'),
            width: $(note).width(),
            height: $(note).height()
        }
    });
 };