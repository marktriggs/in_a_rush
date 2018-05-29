$(function () {

  "use strict";

  /* Keys pressed that aren't a complete command */
  var pendingKeystrokes = [];

  /* Registered key bindings */
  var bindings = [];

  /* Clear existing ArchivesSpace shortcuts.  If this plugin ever gets merged,
  we could just remove them from utils.js and form.js and wouldn't need this. */
  var clearExistingShortcuts = function () {
    if ($._data(document).events.keydown) {
      $.each($._data(document).events.keydown.slice(), function (idx, event) {
        if (event.data && event.data.keys) {
          $(document).off('keydown', event.handler);
        }
      });
    }

    if ($._data(window).events.keydown) {
      $.each($._data(window).events.keydown.slice(), function (idx, event) {
        $(window).off('keydown', event.handler);
      });
    }
  };

  clearExistingShortcuts();
  /* We need to clear shortcuts whenever the form changes because they get
     re-established! */
  $('form').on('formchanged.aspace', clearExistingShortcuts);
  /* End of shortcut clearning nonsense */


  /* Parse a string like 'Control-c' into our canonical representation. */
  var parseKeyString = function (input) {
    var modifiers = [];
    var key = undefined;

    var meta_pattern = /(Control|Alt|Meta)-/g;

    var lastIndex = 0;
    while (true) {
      var match = meta_pattern.exec(input);

      if (match) {
        lastIndex = meta_pattern.lastIndex;
        modifiers.push(match[1]);
      } else {
        key = input.substr(lastIndex);
        break;
      }
    }

    if (key.length != 1 && key !== "Escape") {
      throw("Failed to parse keyboard shortcut: " + input);
    }

    return {
      key: key,
      modifiers: modifiers.sort(),
    };
  };

  /* Parse a keydown event into our canonical representation. */
  var parseKeydown = function (event) {
    var modifiers = [];

    if (event.ctrlKey)  { modifiers.push("Control"); }
    if (event.altKey)   { modifiers.push("Alt");     }
    if (event.metaKey)  { modifiers.push("Meta");    }

    return {
      key: event.key,
      modifiers: modifiers.sort(),
    };
  };

  /* Turn our canonical representation of a keystroke back into a string. */
  var toKeyString = function (parsedKey) {
    var modifiers = parsedKey.modifiers.join('-');

    if (modifiers.length > 0) {
      return modifiers + '-' + parsedKey.key;
    } else {
      return parsedKey.key;
    }
  };

  /* Clear our currently focused search item. */
  var clearFocus = function () {
    $('.in-a-rush-focused').removeClass('in-a-rush-focused');
  };

  /* Focus the search box. */
  var searchHandler = function () {
    var selector = $('#global-search-box');

    clearFocus();
    selector.focus();
  };

/* Move between search results. */
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

  /* Show the help modal. */
  var helpModalTemplate = $(
    '<div class="container-fluid">' +
    '  <table class="table">' +
    '    <tbody>' +
    '        <tr style="display: none" class="template-row">' +
    '          <td class="description"></td>' +
    '          <td class="shortcut"></td>' +
    '        </tr>' +
    '    </tbody>' +
    '  </table>' +
    '</div>');

  var showHelpModal = function () {
    $('#inARushHelp').modal('hide').data('bs.modal', null);

    var lastHeader = undefined;
    var content = helpModalTemplate.clone();
    var tbody = content.find('tbody');
    var template_row = content.find('.template-row');

    $.each(bindings, function (idx, binding_def) {
      var disabled = !binding_def.condition();

      if (!lastHeader || lastHeader != binding_def.category) {
        var header = template_row.clone().removeClass().addClass('shortcut-header');
        var td = $('<td class="shortcut-category" colspan="2" />');
        td.text(binding_def.category);

        header.addClass('bg-info font-weight-bold');
        header.empty().append(td);
        header.show();

        tbody.append(header);
        lastHeader = binding_def.category;
      }


      var row = template_row.clone().removeClass().addClass('shortcut-row');
      row.addClass(disabled ? 'inactive-shortcut-row' : 'active-shortcut-row');

      row.attr('key-sequence', binding_def.keySequence.join(' '));
      var shortcutKeys = $('<span>');

      $.each(binding_def.keySequence, function (idx, key) {
        shortcutKeys.append($('<span class="shortcut-key" />').text(key));
      });

      row.find('.description').text(binding_def.description);
      row.find('.shortcut').append(shortcutKeys);
      row.show();

      tbody.append(row);
    });

    AS.openCustomModal('inARushHelp',
                       'Keyboard shortcuts',
                       content.html(),
                       'large');
  };


  /* If a partial key sequence was entered while the help modal is up, highlight
     the matching keys. */
  var updateHelpModal = function () {
    var modal = $('#inARushHelp');

    if (modal.length === 0) {
      return;
    }

    modal.find('.shortcut-entered').removeClass('shortcut-entered');

    if (pendingKeystrokes.length === 0) {
      return;
    }

    var partialKeySequence = pendingKeystrokes.map(toKeyString).join(' ');

    $('tr.active-shortcut-row').each(function (idx, row) {
      if ($(row).attr('key-sequence').startsWith(partialKeySequence)) {
        $(row).find('.shortcut-key').slice(0, pendingKeystrokes.length).addClass('shortcut-entered');
      }
    });
  };

  var updateKeystrokeIndicator = function () {
    $('#inARushIndicator').fadeOut(500);

    if ($('#inARushHelp:visible').length > 0 || pendingKeystrokes.length === 0) {
      /* If the help is shown, or there are no keystrokes to show, don't show
         the keystroke indicator. */
      return;
    }

    $('#inARushIndicator').remove();
    var indicator = $('<div id="inARushIndicator" class="in-a-rush-keystroke-indicator" />');
    var keyElt = undefined;

    $.each(pendingKeystrokes, function (idx, key) {
      keyElt = $('<div class="shortcut-key" />').text(toKeyString(key));
      indicator.append(keyElt);
    });

    $(document.body).append(indicator);

    /* Animate the CSS class change of the last entered key for prettiness. */
    setTimeout(function () {
      keyElt.addClass('shortcut-entered');
    }, 0);
  };

  /* Add a new key binding */
  var addBinding = function(def) {
    /* Normalise our sequence */
    if (!def.condition) {
      def.condition = function () { return true; };
    }

    def.parsedSequence = def.keySequence.map(parseKeyString);
    bindings.push(def);
  };

  /* Handle a keydown event */
  var handleKeypress = function (event) {
    if (!event.ctrlKey && pendingKeystrokes.length === 0) {
      if ($.inArray(event.target.tagName, ['INPUT', 'TEXTAREA', 'SELECT']) >= 0 ||
          event.target.isContentEditable) {
        /* Leave it alone */
        return true;
      }
    }

    var key = parseKeydown(event);

    if ($.inArray(key.key, key.modifiers) >= 0) {
      /* A keydown event for a single modifier like 'Control'.  We don't care
      about those in isolation, so skip this event. */
      return true;
    }

    /* If the first keystroke included a Control modifier, ignore the modifiers
       on subsequent keystrokes.  This allows a binding like `Control-e e` to be
       entered as `Control-e Control-e`, which can be more kind to people's
       fingers. */
    if (pendingKeystrokes.length > 0 &&
        $.inArray('Control', pendingKeystrokes[0].modifiers) >= 0) {
      key.modifiers = [];
    }

    pendingKeystrokes.push(key);

    var matchedBinding = undefined;
    var partialMatch = false;

    $.each(bindings, function (idx, binding_def) {
      if (binding_def.parsedSequence.map(toKeyString).join(' ') === pendingKeystrokes.map(toKeyString).join(' ')) {
        /* exact match */
        matchedBinding = binding_def;
        return;
      }

      var prefixMatched = true;
      $.each(pendingKeystrokes, function (idx, key) {
        if (idx < binding_def.parsedSequence.length && toKeyString(key) === toKeyString(binding_def.parsedSequence[idx])) {
          /* OK */
        } else {
          prefixMatched = false;
          return;
        }
      });

      if (!partialMatch) {
        partialMatch = prefixMatched;
      }
    });

    updateHelpModal();

    if (partialMatch || (matchedBinding && matchedBinding.condition())) {
      updateKeystrokeIndicator();
    }

    if (partialMatch) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }

    pendingKeystrokes = [];

    if (matchedBinding) {
      if (!matchedBinding.condition()) {
        /* This keybinding isn't applicable in this context. */
        updateKeystrokeIndicator();
        return true;
      }

      if (matchedBinding.handler) {
        var delay = 0;

        /* Small detail: if we're showing the help, give a moment for the final
           key to light up before we dismiss the modal.  Just for the look of the
           thing. */
        if ($('#inARushHelp').length > 0) {
          delay = 200;
        }

        setTimeout(function () {
          $('#inARushHelp').modal('hide').data('bs.modal', null);
          matchedBinding.handler();
          updateKeystrokeIndicator();
        }, delay);

        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    }

    updateKeystrokeIndicator();
    return true;
  };

  /*** Default keyboard shortcut definitions!  ***/

  /* FIXME: We'll need to i18n strings here. */
  addBinding({
    keySequence: ['?'],
    handler: showHelpModal,
    description: "This shortcut reference",
    category: "Help",
  });

  addBinding({
    keySequence: ['Escape'],
    handler: undefined,
    description: "Close a modal window (e.g. this one)",
    category: "Help",
  });

  addBinding({
    keySequence: ['/'],
    handler: searchHandler,
    description: "Go to search",
    condition: function () {
      return $('#global-search-box').length > 0;
    },
    category: "Navigate",
  });

  addBinding({
    keySequence: ['j'],
    handler: function () { moveHandler(1); },
    description: "Go to next record in search results",
    condition: function () { return $('#tabledSearchResults').length > 0; },
    category: "Navigate",
  });

  addBinding({
    keySequence: ['k'],
    handler: function () { moveHandler(-1); },
    description: "Go to previous record in search results",
    condition: function () { return $('#tabledSearchResults').length > 0; },
    category: "Navigate",
  });

  addBinding({
    keySequence: ['B'],
    handler: function () { $('li.browse-container a.dropdown-toggle').trigger('click.bs.dropdown'); },
    description: "Open 'Browse' menu",
    condition: function () { return $('li.browse-container a.dropdown-toggle').length > 0; },
    category: "Navigate",
  });

  addBinding({
    keySequence: ['C'],
    handler: function () { $('li.create-container a.dropdown-toggle').trigger('click.bs.dropdown'); },
    description: "Open 'Create' menu",
    condition: function () { return $('li.create-container a.dropdown-toggle').length > 0; },
    category: "Navigate",
  });

  /* Browse things */
  addBinding({
    keySequence: ['g', 'h'],
    handler: function () { window.location.href = APP_PATH; },
    description: "Go to home screen",
    category: "Browse",
  });

  addBinding({
    keySequence: ['g', 'r'],
    handler: function () { window.location.href = APP_PATH + 'resources'; },
    description: "Go to browse resources",
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'resources' + '"]').length > 0; },
    category: "Browse",
  });

  addBinding({
    keySequence: ['g', 'a'],
    handler: function () { window.location.href = APP_PATH + 'accessions'; },
    description: "Go to browse accessions",
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'accessions' + '"]').length > 0; },
    category: "Browse",
  });

  addBinding({
    keySequence: ['g', 's'],
    handler: function () { window.location.href = APP_PATH + 'subjects'; },
    description: "Go to browse subjects",
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'subjects' + '"]').length > 0; },
    category: "Browse",
  });

  addBinding({
    keySequence: ['g', 'g'],
    handler: function () { window.location.href = APP_PATH + 'agents'; },
    description: "Go to browse agents",
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'agents' + '"]').length > 0; },
    category: "Browse",
  });

  addBinding({
    keySequence: ['g', 'd'],
    handler: function () { window.location.href = APP_PATH + 'digital_objects'; },
    description: "Go to browse digital objects",
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'digital_objects' + '"]').length > 0; },
    category: "Browse",
  });

  addBinding({
    keySequence: ['g', 't'],
    handler: function () { window.location.href = APP_PATH + 'top_containers'; },
    description: "Go to Manage Top Containers",
    condition: function () { return $('.repo-container a[href="' + APP_PATH + 'top_containers' + '"]').length > 0; },
    category: "Browse",
  });


  /* Create things */
  addBinding({
    keySequence: ['c', 'r'],
    handler: function () { window.location.href = APP_PATH + 'resources/new'; },
    description: "Create a resource",
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'resources/new' + '"]').length > 0; },
    category: "Create",
  });

  addBinding({
    keySequence: ['c', 'a'],
    handler: function () { window.location.href = APP_PATH + 'accessions/new'; },
    description: "Create a accession",
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'accessions/new' + '"]').length > 0; },
    category: "Create",
  });

  addBinding({
    keySequence: ['c', 's'],
    handler: function () { window.location.href = APP_PATH + 'subjects/new'; },
    description: "Create a subject",
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'subjects/new' + '"]').length > 0; },
    category: "Create",
  });

  addBinding({
    keySequence: ['c', 'p'],
    handler: function () { window.location.href = APP_PATH + 'agents/agent_person/new'; },
    description: "Create a person",
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'agents/agent_person/new' + '"]').length > 0; },
    category: "Create",
  });

  addBinding({
    keySequence: ['c', 'b'],
    handler: function () { window.location.href = APP_PATH + 'agents/agent_corporate_entity/new'; },
    description: "Create a corporate body entity",
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'agents/agent_corporate_entity/new' + '"]').length > 0; },
    category: "Create",
  });

  addBinding({
    keySequence: ['c', 'f'],
    handler: function () { window.location.href = APP_PATH + 'agents/agent_family/new'; },
    description: "Create a family",
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'agents/agent_family/new' + '"]').length > 0; },
    category: "Create",
  });

  addBinding({
    keySequence: ['c', 'd'],
    handler: function () { window.location.href = APP_PATH + 'digital_objects/new'; },
    description: "Create a digital object",
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'digital_objects/new' + '"]').length > 0; },
    category: "Create",
  });

  addBinding({
    keySequence: ['Control-e', 'f'],
    handler: function () {
      return $('form.aspace-record-form .record-pane :input:visible').first().focus();
    },
    description: "Focus the first field in the edit form",
    condition: function () {
      return $('form.aspace-record-form .record-pane :input:visible').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'd'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="date"] .subrecord-form-heading .btn')[0].click();
    },
    description: "Add a date subrecord",
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="date"] .subrecord-form-heading .btn').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'e'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="extent"] .subrecord-form-heading .btn')[0].click();
    },
    description: "Add a extent subrecord",
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="extent"] .subrecord-form-heading .btn').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'l'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="linked_agent"] .subrecord-form-heading .btn')[0].click();
    },
    description: "Add agent link subrecord",
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="linked_agent"] .subrecord-form-heading .btn').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 's'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="subject"] .subrecord-form-heading .btn')[0].click();
    },
    description: "Add subject subrecord",
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="subject"] .subrecord-form-heading .btn').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'k'],
    handler: function () {
      $(':focus').closest('.subrecord-form-fields').prev('.subrecord-form-remove')[0].click();
    },
    description: "Remove current subrecord",
    condition: function () {
      return $(':focus').closest('.subrecord-form-fields').prev('.subrecord-form-remove').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'x'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="external_document"] .subrecord-form-heading .btn')[0].click();
    },
    description: "Add external document subrecord",
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="external_document"] .subrecord-form-heading .btn').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'c'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn')[0].click();
    },
    description: "Add container instance subrecord",
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'o'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn')[1].click();
    },
    description: "Add digital object instance subrecord",
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn').length > 1;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'n'],
    handler: function () {
      $('form.aspace-record-form #notes .subrecord-form-heading .add-note')[1].click();
    },
    description: "Add note subrecord",
    condition: function () {
      return $('form.aspace-record-form #notes .subrecord-form-heading .add-note').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'v'],
    handler: function () {
      $('#add-event-dropdown .btn')[1].click();
    },
    description: "Add event",
    condition: function () {
      return $('#add-event-dropdown .btn').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-e', 'a'],
    handler: function () {
      var record_specific_link = $('a[href*="assessments/new?record_uri"]');

      if (record_specific_link.length > 0) {
        window.location.href = record_specific_link.attr('href');
      } else {
        window.location.href = $('a[href*="assessments/new"]').attr('href');
      }
    },
    description: "Add assessment",
    condition: function () {
      return $('a[href*="assessments/new"]').length > 0
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-s'],
    handler: function () {
      $('form.aspace-record-form .form-actions button.btn-primary').click();
    },
    description: "Save the record being edited",
    condition: function () {
      return $('form.aspace-record-form .form-actions button.btn-primary').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['Control-k'],
    handler: function () {
      $('form.aspace-record-form .form-actions .btn-cancel')[0].click();
    },
    description: "Close a record being edited",
    condition: function () {
      return $('form.aspace-record-form .form-actions .btn-cancel').length > 0;
    },
    category: "Edit",
  });

  addBinding({
    keySequence: ['i', 'd', 'd', 'q', 'd'],
    handler: function () {
      setTimeout(function () {
        window.alert("Nice try.");
      }, 200);
    },
    description: "Become admin",
    category: "Miscellaneous",
  });

  /*** End of default keyboard shortcut definitions ***/


  /* Event listeners */
  document.addEventListener('focusout', function (event) {
    clearFocus();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key == '?') {
      pendingKeystrokes = [];
      updateKeystrokeIndicator();
      showHelpModal();
      return true;
    }

    if (event.key == 'Escape') {
      pendingKeystrokes = [];
      updateKeystrokeIndicator();
      return true;
    }

    return handleKeypress(event);
  });
});
