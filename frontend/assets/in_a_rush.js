$(function () {

  "use strict";

  var bindings = {};

  var clearFocus = function () {
    $('.in-a-rush-focused').removeClass('in-a-rush-focused');
  };

  var searchHandler = function () {
    var selector = $('#global-search-box');

    clearFocus();
    selector.focus();
  };

  var moveHandler = function (direction) {
    var currentRow = $(':focus').closest('#tabledSearchResults tbody tr')[0];

    var selector;
    if (currentRow) {
      selector = (direction > 0) ? $(currentRow).next() : $(currentRow).prev();

      if (selector.length === 0) {
        return;
      }
    } else {
      selector = $('#tabledSearchResults tbody tr').first();
    }

    selector.find('.btn').first().focus();
    clearFocus();
    selector.addClass('in-a-rush-focused');
  };

  bindings['/'] = searchHandler;
  bindings['j'] = function () { moveHandler(1); };
  bindings['k'] = function () { moveHandler(-1); };

  document.body.addEventListener('focusout', function (event) {
    clearFocus();
  });

  document.body.addEventListener('keypress', function (event) {
    var canHandleEvent = true;

    if ($.inArray(event.key, Object.keys(bindings)) < 0 ||
        $.inArray(event.target.tagName, ['INPUT', 'TEXTAREA', 'SELECT']) >= 0 ||
        event.target.isContentEditable) {
      /* Leave it alone */
      return true;
    }

    bindings[event.key]();
    event.preventDefault();
    return false;
  });

});
