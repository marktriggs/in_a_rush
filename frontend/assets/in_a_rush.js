window.InARush = {};

$(function () {

  "use strict";

  /* Keys pressed that aren't yet a complete command */
  var pendingKeystrokes = [];

  /* Registered key bindings */
  var bindings = [];

  /* For the sake of how we display mappings to users, sometimes we want to
     pretend that what they really entered is something different.  For example,
     'Shift-|' is rendered as 'Shift-\'. */
  var KEY_TRANSLATIONS = {
    '|': '\\',
  };

  var translate = function(s) {
    return (IN_A_RUSH_TRANSLATIONS[s] || s);
  };

  var ArchivesSpaceCompatibility = {
    /* Clear existing ArchivesSpace shortcuts.  If this plugin ever gets merged,
       we could just remove them from utils.js and form.js and wouldn't need this. */
    clearExistingShortcuts: function () {
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
    },
  };

  var KeyParsing = {
    /* Parse a string like 'Control-c' into our canonical representation. */
    parseKeyString: function (input) {
      var modifiers = [];
      var key = undefined;

      var metaPattern = /(Control|Shift|Alt|Meta)-/g;

      var lastIndex = 0;
      while (true) {
        var match = metaPattern.exec(input);

        if (match) {
          lastIndex = metaPattern.lastIndex;
          modifiers.push(match[1]);
        } else {
          key = input.substr(lastIndex);
          break;
        }
      }

      return {
        key: key,
        modifiers: modifiers.sort(),
      };
    },

    /* Parse a keydown event into our canonical representation. */
    parseKeydown: function (event) {
      var modifiers = [];

      if (event.ctrlKey)  { modifiers.push("Control"); }
      if (event.altKey)   { modifiers.push("Alt");     }
      if (event.metaKey)  { modifiers.push("Meta");    }
      if (event.shiftKey)  { modifiers.push("Shift");  }

      var key = event.key.toLowerCase();

      if (KEY_TRANSLATIONS[key]) {
        key = KEY_TRANSLATIONS[key];
      }

      return {
        key: key,
        modifiers: modifiers.sort(),
      };
    },

    /* Turn our canonical representation of a keystroke back into a string. */
    toKeyString: function (parsedKey) {
      var modifiers = parsedKey.modifiers.join('-');

      if (modifiers.length > 0) {
        return modifiers + '-' + parsedKey.key;
      } else {
        return parsedKey.key;
      }
    },
  };


  var FormNavigation = {
    /* Clear our currently focused search item. */
    clearFocus: function () {
      $('.in-a-rush-focused').removeClass('in-a-rush-focused');
    },

    /* Focus the search box. */
    searchHandler: function () {
      var selector = $('#global-search-box');

      FormNavigation.clearFocus();
      selector.focus();
    },

    /* Move between search results. */
    moveHandler: function (direction) {
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
      FormNavigation.clearFocus();
      selector.addClass('in-a-rush-focused');
    },

    focusSubrecordIfNeeded: function (headingElt) {
      var subrecord = headingElt ?
                      $(headingElt).next('.subrecord-form-container').find('.subrecord-form-fields').last() :
                      $(':focus').closest('.subrecord-form-fields');

      if (subrecord.length !== 1) {
        return;
      }

      if ($(':focus').length === 0) {
        subrecord.find(':input:visible').first().focus();
      }

      var offset = subrecord[0].getBoundingClientRect();
      var viewportHeight = (window.innerHeight || document. documentElement.clientHeight);

      if (offset.top < 0 || offset.bottom > viewportHeight) {
        $(window).scrollTo(subrecord, 500, { offset: -50 });
      }
    },
  };


  var Help = {
    modalId: 'InARushHelp',
    indicatorId: 'InARushIndicator',

    helpModalTemplate: $(
      '<div class="container-fluid">' +
      '  <table class="table">' +
      '    <tbody>' +
      '        <tr style="display: none" class="template-row">' +
      '          <td class="description"></td>' +
      '          <td class="shortcut"></td>' +
      '        </tr>' +
      '    </tbody>' +
      '  </table>' +
      '</div>'),

    /* Show the help modal. */
    showHelpModal: function () {
      $('#' + Help.modalId).modal('hide').data('bs.modal', null);

      var lastHeader = undefined;
      var content = Help.helpModalTemplate.clone();
      var tbody = content.find('tbody');
      var templateRow = content.find('.template-row');

      $.each(bindings, function (idx, bindingDef) {
        var disabled = !bindingDef.condition();

        if (!lastHeader || lastHeader != bindingDef.category) {
          var header = templateRow.clone().removeClass().addClass('shortcut-header');
          var td = $('<td class="shortcut-category" colspan="2" />');
          td.text(bindingDef.category);

          header.addClass('bg-info font-weight-bold');
          header.empty().append(td);
          header.show();

          tbody.append(header);
          lastHeader = bindingDef.category;
        }

        var row = templateRow.clone().removeClass().addClass('shortcut-row');
        row.addClass(disabled ? 'inactive-shortcut-row' : 'active-shortcut-row');

        row.attr('key-sequence', bindingDef.keySequence.join(' '));
        var shortcutKeys = $('<span>');

        $.each(bindingDef.keySequence, function (idx, key) {
          shortcutKeys.append($('<span class="shortcut-key" />').text(key));
        });

        row.find('.description').text(bindingDef.description);
        row.find('.shortcut').append(shortcutKeys);
        row.show();

        tbody.append(row);
      });

      AS.openCustomModal(Help.modalId,
                         translate('keyboard_shortcuts'),
                         content.html(),
                         'large');
    },

    /* If a partial key sequence was entered while the help modal is up, highlight
       the matching keys. */
    updateHelpModal: function () {
      var modal = $('#' + Help.modalId);

      if (modal.length === 0) {
        return;
      }

      modal.find('.shortcut-entered').removeClass('shortcut-entered');

      if (pendingKeystrokes.length === 0) {
        return;
      }

      var partialKeySequence = pendingKeystrokes.map(KeyParsing.toKeyString).join(' ');

      $('tr.active-shortcut-row').each(function (idx, row) {
        if ($(row).attr('key-sequence').startsWith(partialKeySequence)) {
          $(row).find('.shortcut-key').slice(0, pendingKeystrokes.length).addClass('shortcut-entered');
        }
      });
    },

    updateKeystrokeIndicator: function () {
      if ($('#' + Help.modalId + ':visible').length > 0 || pendingKeystrokes.length === 0) {
        /* If the help is shown, or there are no keystrokes to show, don't show
           the keystroke indicator. */
        $('#' + Help.indicatorId).attr('id', null).fadeOut(500, function () {
          $(this).remove();
        });
        return;
      }

      var indicator = $('#' + Help.indicatorId);

      if (indicator.length === 0) {
        indicator = $('<div id="' + Help.indicatorId + '" class="in-a-rush-keystroke-indicator" />');
        $(document.body).append(indicator);
      }

      /* No need to re-render our existing keys */
      var existingKeys = indicator.find('.shortcut-key');
      var existingKeyCount = existingKeys.length;

      existingKeys.removeClass('shortcut-entered');

      var keyElt = undefined;

      $.each(pendingKeystrokes, function (idx, key) {
        if (idx >= existingKeyCount) {
          keyElt = $('<div class="shortcut-key" />').text(KeyParsing.toKeyString(key));
          indicator.append(keyElt);
        }
      });


      /* Animate the CSS class change of the last entered key for prettiness. */
      setTimeout(function () {
        keyElt.addClass('shortcut-entered');
      }, 0);
    },
  };

  var Bindings = {
    /* Add a new key binding */
    addBinding: function(def) {
      /* Normalise our sequence */
      if (!def.condition) {
        def.condition = function () { return true; };
      }

      var bindingOk = true;
      $.each(['id', 'category', 'description', 'handler', 'keySequence'], function (idx, attr) {
        if (!def[attr]) {
          console.log("Your key binding is missing an '" + attr + "' attribute", def);
          bindingOk = false;
        }
      });

      if (!bindingOk) {
        return;
      }

      def.parsedSequence = def.keySequence.map(KeyParsing.parseKeyString);
      bindings.push(def);
    },

    rebind: function(bindingId, newShortcut) {
      $.each(bindings, function (idx, bindingDef) {
        if (bindingDef.id == bindingId) {
          bindingDef.keySequence = newShortcut;
          bindingDef.parsedSequence = newShortcut.map(KeyParsing.parseKeyString);
          return false;
        }
      });
    },

    exactMatch: function (keyseq1, keyseq2) {
      return keyseq1.map(KeyParsing.toKeyString).join(' ') === keyseq2.map(KeyParsing.toKeyString).join(' ');
    },

    hasPrefix: function (keyseq, candidatePrefix) {
      var result = true;

      $.each(candidatePrefix, function (idx, key) {
        if (idx < keyseq.length && KeyParsing.toKeyString(key) === KeyParsing.toKeyString(keyseq[idx])) {
          /* OK */
        } else {
          result = false;
          return false;
        }
      });

      return result;
    },

    eventIntendedForFormElement: function (event) {
      /* We don't want to catch input events in a form control UNLESS the event
         was a control-modified key sequence. */
      if (event.ctrlKey ||
          (pendingKeystrokes.length > 0 && $.inArray('Control', pendingKeystrokes[0].modifiers) >= 0)) {
        /* This is a control-modified sequence, so we won't ignore it. */
        return false;
      } else {
        if ($.inArray(event.target.tagName, ['INPUT', 'TEXTAREA', 'SELECT']) >= 0 ||
            event.target.isContentEditable) {
          /* Leave it alone */
          return true;
        }
      }

      return false;
    },


    /* Handle a keydown event */
    handleKeypress: function (event) {
      if (Bindings.eventIntendedForFormElement(event)) {
        return true;
      }

      var key = KeyParsing.parseKeydown(event);

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

      /* Attempt to match the keys typed so far to one of our bindings.  Either
         nothing matches, or we get an exact match, or we get a partial (prefix)
         match. */
      $.each(bindings, function (idx, bindingDef) {
        if (Bindings.exactMatch(bindingDef.parsedSequence, pendingKeystrokes)) {
          matchedBinding = bindingDef;
          return;
        }

        if (Bindings.hasPrefix(bindingDef.parsedSequence, pendingKeystrokes)) {
          partialMatch = true;
        }
      });

      /* Render the new keystroke if the help modal is active. */
      Help.updateHelpModal();

      /* ... and if it's not, show the keystroke indicator */
      if (partialMatch || (matchedBinding && matchedBinding.condition())) {
        Help.updateKeystrokeIndicator();
      }

      if (partialMatch) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }

      /* If we make it to here, either we got an exact match or no match at all.
         In either case, we're done with the pending keystrokes. */
      pendingKeystrokes = [];

      if (matchedBinding) {
        /* Process our exact match */
        if (!matchedBinding.condition()) {
          /* This keybinding isn't applicable in this context. */
          Help.updateKeystrokeIndicator();
          return true;
        }

        /* Small detail: if we're showing the help, give a moment for the final
           key to light up before we dismiss the modal.  Just for the look of the
           thing. */
        var delay = ($('#' + Help.modalId).length > 0) ? 200 : 0;

        setTimeout(function () {
          $('#' + Help.modalId).modal('hide').data('bs.modal', null);
          matchedBinding.handler();
          Help.updateKeystrokeIndicator();
        }, delay);

        event.preventDefault();
        event.stopPropagation();
        return false;
      } else {
        /* No match.  Let the keystroke through (maybe someone else cares) */
        Help.updateKeystrokeIndicator();
        return true;
      }
    },
  };

  /*** Event listeners ***/
  document.addEventListener('focusout', function (event) {
    FormNavigation.clearFocus();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key == '?') {
      if (Bindings.eventIntendedForFormElement(event)) {
        return true;
      }

      pendingKeystrokes = [];
      Help.updateKeystrokeIndicator();
      Help.showHelpModal();
      return true;
    }

    if (event.key == 'Escape') {
      pendingKeystrokes = [];
      Help.updateKeystrokeIndicator();
      return true;
    }

    return Bindings.handleKeypress(event);
  });

  /* We need to clear shortcuts whenever the form changes because they get
     re-established! */
  ArchivesSpaceCompatibility.clearExistingShortcuts();
  $('form').on('formchanged.aspace', ArchivesSpaceCompatibility.clearExistingShortcuts);


  /*** Exports ***/
  InARush.KeyParsing = KeyParsing;
  InARush.FormNavigation = FormNavigation;
  InARush.Help = Help;
  InARush.Bindings = Bindings;


  /*** Default keyboard shortcut definitions!  ***/
  Bindings.addBinding({
    id: 'shortcut_reference',
    keySequence: ['?'],
    handler: Help.showHelpModal,
    description: translate('shortcut_reference'),
    category: translate('category_help'),
  });

  Bindings.addBinding({
    id: 'close_modal',
    keySequence: ['Escape'],
    handler: function () {},
    description: translate('close_modal'),
    category: translate('category_help'),
  });

  Bindings.addBinding({
    id: 'go_to_search',
    keySequence: ['/'],
    handler: FormNavigation.searchHandler,
    description: translate('go_to_search'),
    condition: function () {
      return $('#global-search-box').length > 0;
    },
    category: translate('category_navigate'),
  });

  Bindings.addBinding({
    id: 'next_search_result',
    keySequence: ['j'],
    handler: function () { FormNavigation.moveHandler(1); },
    description: translate('next_search_result'),
    condition: function () { return $('#tabledSearchResults').length > 0; },
    category: translate('category_navigate'),
  });

  Bindings.addBinding({
    id: 'prev_search_result',
    keySequence: ['k'],
    handler: function () { FormNavigation.moveHandler(-1); },
    description: translate('prev_search_result'),
    condition: function () { return $('#tabledSearchResults').length > 0; },
    category: translate('category_navigate'),
  });

  Bindings.addBinding({
    id: 'open_browse_menu',
    keySequence: ['Shift-b'],
    handler: function () { $('li.browse-container a.dropdown-toggle').trigger('click.bs.dropdown'); },
    description: translate('open_browse_menu'),
    condition: function () { return $('li.browse-container a.dropdown-toggle').length > 0; },
    category: translate('category_navigate'),
  });

  Bindings.addBinding({
    id: 'toggle_advanced_search',
    keySequence: ['Shift-\\'],
    handler: function () {
      $('button.search-switcher')[0].click();
      setTimeout(function () {
        $('.advanced-search-row-container :input:visible').first().focus();
      });
    },
    description: translate('toggle_advanced_search'),
    condition: function () { return $('button.search-switcher').length > 0; },
    category: translate('category_navigate'),
  });

  Bindings.addBinding({
    id: 'open_create_menu',
    keySequence: ['Shift-c'],
    handler: function () { $('li.create-container a.dropdown-toggle').trigger('click.bs.dropdown'); },
    description: translate('open_create_menu'),
    condition: function () { return $('li.create-container a.dropdown-toggle').length > 0; },
    category: translate('category_navigate'),
  });

  /* Browse things */
  Bindings.addBinding({
    id: 'lassie_come_home',
    keySequence: ['g', 'h'],
    handler: function () { window.location.href = APP_PATH; },
    description: translate('lassie_come_home'),
    category: translate('category_browse'),
  });

  Bindings.addBinding({
    id: 'browse_resources',
    keySequence: ['g', 'r'],
    handler: function () { window.location.href = APP_PATH + 'resources'; },
    description: translate('browse_resources'),
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'resources' + '"]').length > 0; },
    category: translate('category_browse'),
  });

  Bindings.addBinding({
    id: 'browse_accessions',
    keySequence: ['g', 'a'],
    handler: function () { window.location.href = APP_PATH + 'accessions'; },
    description: translate('browse_accessions'),
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'accessions' + '"]').length > 0; },
    category: translate('category_browse'),
  });

  Bindings.addBinding({
    id: 'browse_subjects',
    keySequence: ['g', 's'],
    handler: function () { window.location.href = APP_PATH + 'subjects'; },
    description: translate('browse_subjects'),
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'subjects' + '"]').length > 0; },
    category: translate('category_browse'),
  });

  Bindings.addBinding({
    id: 'browse_agents',
    keySequence: ['g', 'g'],
    handler: function () { window.location.href = APP_PATH + 'agents'; },
    description: translate('browse_agents'),
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'agents' + '"]').length > 0; },
    category: translate('category_browse'),
  });

  Bindings.addBinding({
    id: 'browse_digital_objects',
    keySequence: ['g', 'd'],
    handler: function () { window.location.href = APP_PATH + 'digital_objects'; },
    description: translate('browse_digital_objects'),
    condition: function () { return $('.browse-container a[href="' + APP_PATH + 'digital_objects' + '"]').length > 0; },
    category: translate('category_browse'),
  });

  Bindings.addBinding({
    id: 'manage_top_containers',
    keySequence: ['g', 't'],
    handler: function () { window.location.href = APP_PATH + 'top_containers'; },
    description: translate('manage_top_containers'),
    condition: function () { return $('.repo-container a[href="' + APP_PATH + 'top_containers' + '"]').length > 0; },
    category: translate('category_browse'),
  });


  /* Create things */
  Bindings.addBinding({
    id: 'create_resource',
    keySequence: ['c', 'r'],
    handler: function () { window.location.href = APP_PATH + 'resources/new'; },
    description: translate('create_resource'),
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'resources/new' + '"]').length > 0; },
    category: translate('category_create'),
  });

  Bindings.addBinding({
    id: 'create_accession',
    keySequence: ['c', 'a'],
    handler: function () { window.location.href = APP_PATH + 'accessions/new'; },
    description: translate('create_accession'),
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'accessions/new' + '"]').length > 0; },
    category: translate('category_create'),
  });

  Bindings.addBinding({
    id: 'create_subject',
    keySequence: ['c', 's'],
    handler: function () { window.location.href = APP_PATH + 'subjects/new'; },
    description: translate('create_subject'),
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'subjects/new' + '"]').length > 0; },
    category: translate('category_create'),
  });

  Bindings.addBinding({
    id: 'create_person',
    keySequence: ['c', 'p'],
    handler: function () { window.location.href = APP_PATH + 'agents/agent_person/new'; },
    description: translate('create_person'),
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'agents/agent_person/new' + '"]').length > 0; },
    category: translate('category_create'),
  });

  Bindings.addBinding({
    id: 'create_corporate',
    keySequence: ['c', 'b'],
    handler: function () { window.location.href = APP_PATH + 'agents/agent_corporate_entity/new'; },
    description: translate('create_corporate'),
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'agents/agent_corporate_entity/new' + '"]').length > 0; },
    category: translate('category_create'),
  });

  Bindings.addBinding({
    id: 'create_family',
    keySequence: ['c', 'f'],
    handler: function () { window.location.href = APP_PATH + 'agents/agent_family/new'; },
    description: translate('create_family'),
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'agents/agent_family/new' + '"]').length > 0; },
    category: translate('category_create'),
  });

  Bindings.addBinding({
    id: 'create_digital_object',
    keySequence: ['c', 'd'],
    handler: function () { window.location.href = APP_PATH + 'digital_objects/new'; },
    description: translate('create_digital_object'),
    condition: function () { return $('.create-container a[href="' + APP_PATH + 'digital_objects/new' + '"]').length > 0; },
    category: translate('category_create'),
  });

  Bindings.addBinding({
    id: 'focus_form',
    keySequence: ['Control-e', 'f'],
    handler: function () {
      return $('form.aspace-record-form .record-pane :input:visible').first().focus();
    },
    description: translate('focus_form'),
    condition: function () {
      return $('form.aspace-record-form .record-pane :input:visible').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'date_subrecord',
    keySequence: ['Control-e', 'd'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="date"] .subrecord-form-heading .btn')[0].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form section[data-object-name="date"] .subrecord-form-heading'));
    },
    description: translate('date_subrecord'),
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="date"] .subrecord-form-heading .btn').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'extent_subrecord',
    keySequence: ['Control-e', 'e'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="extent"] .subrecord-form-heading .btn')[0].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form section[data-object-name="extent"] .subrecord-form-heading'));
    },
    description: translate('extent_subrecord'),
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="extent"] .subrecord-form-heading .btn').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'agent_subrecord',
    keySequence: ['Control-e', 'l'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="linked_agent"] .subrecord-form-heading .btn')[0].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form section[data-object-name="linked_agent"] .subrecord-form-heading'));
    },
    description: translate('agent_subrecord'),
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="linked_agent"] .subrecord-form-heading .btn').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'subject_subrecord',
    keySequence: ['Control-e', 's'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="subject"] .subrecord-form-heading .btn')[0].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form section[data-object-name="subject"] .subrecord-form-heading'));
    },
    description: translate('subject_subrecord'),
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="subject"] .subrecord-form-heading .btn').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'remove_subrecord',
    keySequence: ['Control-e', 'r'],
    handler: function () {
      var elt = $(':focus').closest('.subrecord-form-fields').prev('.subrecord-form-remove')[0];

      /* If our immediate subrecord-form-fields didn't have a remove button, we
         might be in a note subrecord, which have an extra level of
         subrecord-form-fields nesting.  Keep looking! */
      if (!elt) {
        elt = $(':focus').parents('.subrecord-form-fields').last().prev('.subrecord-form-remove')[0];
      }

      if (elt) {
        elt.click();
      }
    },
    description: translate('remove_subrecord'),
    condition: function () {
      return (
        $(':focus').closest('.subrecord-form-fields').prev('.subrecord-form-remove').length > 0 ||
        $(':focus').parents('.subrecord-form-fields').last().prev('.subrecord-form-remove').length > 0
      );
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'external_document_subrecord',
    keySequence: ['Control-e', 'x'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="external_document"] .subrecord-form-heading .btn')[0].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form section[data-object-name="external_document"] .subrecord-form-heading'));
    },
    description: translate('external_document_subrecord'),
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="external_document"] .subrecord-form-heading .btn').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'container_instance_subrecord',
    keySequence: ['Control-e', 'c'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn')[0].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading'));
    },
    description: translate('container_instance_subrecord'),
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'digital_object_instance_subrecord',
    keySequence: ['Control-e', 'o'],
    handler: function () {
      $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn')[1].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading'));
    },
    description: translate('digital_object_instance_subrecord'),
    condition: function () {
      return $('form.aspace-record-form section[data-object-name="instance"] .subrecord-form-heading .btn').length > 1;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'note_subrecord',
    keySequence: ['Control-e', 'n'],
    handler: function () {
      $('form.aspace-record-form #notes .subrecord-form-heading .add-note')[0].click();
      FormNavigation.focusSubrecordIfNeeded($('form.aspace-record-form #notes .subrecord-form-heading'));
    },
    description: translate('note_subrecord'),
    condition: function () {
      return $('form.aspace-record-form #notes .subrecord-form-heading .add-note').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'add_event',
    keySequence: ['Control-e', 'v'],
    handler: function () {
      $('#add-event-dropdown .btn')[1].click();
    },
    description: translate('add_event'),
    condition: function () {
      return $('#add-event-dropdown .btn').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'add_assessment',
    keySequence: ['Control-e', 'a'],
    handler: function () {
      var record_specific_link = $('a[href*="assessments/new?record_uri"]');

      if (record_specific_link.length > 0) {
        window.location.href = record_specific_link.attr('href');
      } else {
        window.location.href = $('a[href*="assessments/new"]').attr('href');
      }
    },
    description: translate('add_assessment'),
    condition: function () {
      return $('a[href*="assessments/new"]').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'save_record',
    keySequence: ['Control-s'],
    handler: function () {
      $('form.aspace-record-form .form-actions button.btn-primary:visible').click();
    },
    description: translate('save_record'),
    condition: function () {
      return $('form.aspace-record-form .form-actions button.btn-primary:visible').length > 0;
    },
    category: translate('category_edit'),
  });

  Bindings.addBinding({
    id: 'close_record',
    keySequence: ['Control-k'],
    handler: function () {
      $('.breadcrumb-row li.active').prev('li').find('a')[0].click();
    },
    description: translate('close_record'),
    condition: function () {
      return $('.breadcrumb-row li.active').prev('li').find('a').length > 0;
    },
    category: translate('category_edit'),
  });
});
