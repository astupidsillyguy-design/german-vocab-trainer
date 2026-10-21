import { plural } from '../plural';
import type { Messages } from './types';

export const en = {
  meta: {
    appName: 'German Vocab',
    appDescription: 'Test and keep track of the German words you have learned',
  },
  common: {
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'OK',
    clear: 'Clear',
    loading: 'Loading…',
    more: 'More',
    undo: 'Undo',
    done: 'Done',
    delete: 'Delete',
    search: 'Search',
  },
  nav: {
    primary: 'Main navigation',
    quiz: 'Quiz',
    archive: 'Archive',
    wordList: 'Word List',
    settings: 'Settings',
    skipToContent: 'Skip to main content',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Expand sidebar',
  },
  pwa: {
    updateReady: 'A new version is available',
    updateReadyDescription: 'Reload to update. Your words and progress are kept.',
    reload: 'Reload',
  },
  overlay: {
    sheetHandle: 'Resize panel',
    notifications: 'Notifications',
    dismissNotification: 'Dismiss notification',
  },
  locale: {
    label: 'Language',
  },
  data: {
    saveFailed: 'Changes couldn’t be saved',
    saveFailedReason: {
      quota:
        'Your device is out of storage. Free up some space and try again — keep this page open until then.',
      version:
        'A newer version of the app now manages your data. Reload the page before making changes.',
      unavailable:
        'The connection to local storage was lost. Try again, or reload the page if it keeps failing.',
      unknown:
        'Your changes are still on this page. Try again and make sure they’re saved before closing it.',
    },
    retry: 'Try Again',
    saveRecovered: 'Changes saved',
    storageUnavailable: 'Local storage unavailable',
    storageUnavailableReason: {
      quota:
        'Your device is out of storage, so the local database can’t be opened. Changes will only last until you close this page.',
      version:
        'Your data was saved by a newer version of the app. Reload the page to use it; until then, changes won’t be saved.',
      unavailable:
        'This browser doesn’t let the site store data (for example in private browsing). Changes will only last until you close this page.',
      unknown:
        'The local database couldn’t be opened. Changes will only last until you close this page.',
    },
    quarantined: (count: number) =>
      plural('en', count, {
        one: `Found ${count} unrecognized item`,
        other: `Found ${count} unrecognized items`,
      }),
    quarantinedDescription:
      'They were kept exactly as found. You can export or clear them in Settings.',
    review: 'View',
    legacy: {
      found: 'Data from the old version found',
      foundDescription:
        'Your lists aren’t empty, so it wasn’t imported automatically. You can merge or replace in Settings.',
      review: 'Open Settings',
      migrated: 'Data from the old version imported',
      migratedDescription: (counts: string, rejected: number) =>
        rejected > 0
          ? `${counts}. ${plural('en', rejected, { one: `${rejected} unrecognized record was`, other: `${rejected} unrecognized records were` })} kept as is — see Settings.`
          : counts,
    },
  },
  glass: {
    tiers: {
      webgl: 'WebGL refraction',
      refraction: 'CSS refraction',
      blur: 'Blur only',
      opaque: 'Opaque',
    },
    preferences: {
      auto: 'Automatic',
      refraction: 'CSS refraction',
      blur: 'Blur only',
      opaque: 'Opaque',
    },
  },
  settings: {
    general: {
      header: 'General',
      glass: 'Glass Effect',
      glassFooter: (tier: string) =>
        `Currently: ${tier}. Automatic decides based on your device’s performance and the system’s Reduce Transparency and Reduce Motion settings.`,
    },
    speech: {
      header: 'Pronunciation',
      rate: 'Speaking Rate',
      rateValue: (rate: string) => `${rate}×`,
      voice: 'Voice',
      automatic: 'Automatic',
      voiceLabel: (name: string) => `Voice: ${name}`,
      voiceName: (name: string, lang: string) => `${name} (${lang})`,
      noVoices: 'No German voices',
      preview: 'Preview',
      footer:
        'Automatic prefers voices installed on this device: they work offline and start faster. If there are no German voices, add one in your system’s language or accessibility settings.',
      unavailable: 'This browser doesn’t support speech',
      notSaved: 'Couldn’t save the setting. It applies until you close the page.',
    },
    data: {
      header: 'Data',
      storage: 'Local Storage',
      storageKind: {
        indexeddb: 'Saved in this browser',
        memory: 'This session only — lost when the page closes',
      },
      persistence: { saved: 'Saved', saving: 'Saving…', failed: 'Not saved' },
      words: 'Words',
      wordCounts: (pool: number, archive: number) => `${pool} to practice · ${archive} archived`,
      exportText: 'Export as Plain Text…',
      importLegacy: 'Import from Old Version…',
      sync: 'Device Sync…',
    },
    quarantine: {
      header: 'Unrecognized Data',
      footer:
        'This data is malformed and couldn’t be loaded, but it was kept exactly as found. Export it to inspect the contents or to get help recovering it.',
      count: (count: number) =>
        plural('en', count, { one: `${count} record`, other: `${count} records` }),
      export: 'Export as JSON',
      exported: 'Exported',
      clear: 'Clear…',
      clearTitle: 'Clear unrecognized data?',
      clearMessage: (count: number) =>
        plural('en', count, {
          one: `This permanently deletes ${count} record and can’t be undone. Consider exporting a backup first.`,
          other: `This permanently deletes these ${count} records and can’t be undone. Consider exporting a backup first.`,
        }),
      cleared: 'Unrecognized data cleared',
      failed: 'Something went wrong. Please try again.',
    },
    snapshots: {
      header: 'Snapshot History',
      footer: (limit: number) =>
        `A snapshot is saved automatically before replacing the practice list, archiving a unit, deleting lessons or chapters from the archive, receiving a sync, or importing data. The ${limit} most recent are kept.`,
      empty: 'No snapshots yet',
      reasons: {
        'replace-pool': 'Before replacing practice list',
        archive: 'Before archiving a unit',
        delete: 'Before deleting from archive',
        sync: 'Before receiving sync',
        import: 'Before importing data',
        restore: 'Before restoring snapshot',
        'legacy-backup': 'Old version: before receiving sync',
      },
      restore: 'Restore',
      restoreLabel: (reason: string, time: string) => `Restore “${reason}” (${time})`,
      restoreTitle: 'Restore this snapshot?',
      restoreMessage: (time: string) =>
        `Your practice list and archive will go back to how they were on ${time}. The current contents will be saved as a snapshot first.`,
      restored: 'Snapshot restored',
      undone: 'Restore undone',
      missing: 'This snapshot no longer exists',
      failed: 'Couldn’t restore the snapshot',
    },
    exportText: {
      title: 'Export as Plain Text',
      collection: 'Contents',
      collections: { archive: 'Archive', pool: 'Practice List' },
      preview: 'Preview',
      summary: (count: number) =>
        plural('en', count, { one: `${count} word`, other: `${count} words` }),
      empty: (collection: string) => `${collection}: no words yet.`,
      copy: 'Copy',
      copied: 'Copied to clipboard',
      copyFailed: 'Couldn’t copy. Select the text and copy it manually.',
      download: 'Download .txt',
      downloaded: 'Download started',
      footer:
        'Same format as the Word List page: paste it back into the word list, or keep it as a backup.',
    },
    legacy: {
      title: 'Import from Old Version',
      intro:
        'Import the practice list, archive, and archive order saved by the original single-file HTML version. Data in the old version isn’t changed.',
      source: 'Source',
      local: 'Old-version data on this device',
      localDescription: 'Found at this address',
      choose: 'Use',
      chosen: 'Selected',
      file: 'Export File',
      fileDescription: 'JSON file from the export tool or the console code',
      chooseFile: 'Choose File…',
      selectedFile: (name: string) => `Selected: ${name}`,
      errors: {
        'invalid-json': 'This file isn’t valid JSON.',
        'no-legacy-data': 'This file doesn’t contain data from the old version.',
        'too-large': 'This file is too large to be an export from the old version.',
        'read-failed': 'Couldn’t read this file.',
      },
      preview: 'Preview',
      pool: 'Practice List',
      archive: 'Archive',
      backup: 'Backup from before a sync',
      words: (count: number) =>
        plural('en', count, { one: `${count} word`, other: `${count} words` }),
      archiveValue: (entries: number, chapters: number) =>
        `${plural('en', entries, { one: `${entries} word`, other: `${entries} words` })} · ${plural('en', chapters, { one: `${chapters} chapter`, other: `${chapters} chapters` })}`,
      notes: {
        nothing: 'There are no words in the old data.',
        bareNouns: (count: number) =>
          plural('en', count, {
            one: `Answers without an article were removed from ${count} noun (nouns now require the article).`,
            other: `Answers without an article were removed from ${count} nouns (nouns now require the article).`,
          }),
        synthetic: (count: number) =>
          plural('en', count, {
            one: `${count} auto-generated “base form” question was skipped (the old version hides it too).`,
            other: `${count} auto-generated “base form” questions were skipped (the old version hides them too).`,
          }),
        rejected: (count: number) =>
          plural('en', count, {
            one: `${count} unrecognized record will be kept as is; you can export it in Settings.`,
            other: `${count} unrecognized records will be kept as is; you can export them in Settings.`,
          }),
      },
      mode: 'Import Method',
      modes: { merge: 'Merge', replace: 'Replace' },
      modeDescriptions: {
        merge:
          'Keeps your current words and adds only new ones; words with the same prompt and answers in the same lesson count as existing. A snapshot is saved first, so you can undo.',
        replace:
          'Replaces your practice list and archive with the old data. A snapshot is saved first, so you can undo.',
      },
      import: 'Import',
      imported: 'Old data imported',
      importedDescription: (counts: string, duplicates: number) =>
        duplicates > 0
          ? `Added ${counts}; skipped ${plural('en', duplicates, { one: `${duplicates} existing word`, other: `${duplicates} existing words` })}`
          : `Added ${counts}`,
      tooMany: (limit: number) =>
        `Merging would exceed the limit of ${limit} words per list. Use Replace instead.`,
      failed: 'Import failed. Please try again.',
      undone: 'Import undone',
      undoFailed: 'Couldn’t undo the import',
      help: {
        title: 'How do I export data from the old version?',
        steps: [
          'Download the export tool and save it on the computer that has the old HTML file.',
          'Open the export tool in the browser you use for the old version and click “Export Data”.',
          'Come back here and choose the downloaded JSON file.',
        ],
        download: 'Download Export Tool',
        consoleIntro:
          'If the export tool finds no data (for example, Firefox keeps storage separate for each local file): open the old version, press F12 to open the Console in the developer tools, paste the code below, and press Enter.',
        consoleLabel: 'Console Code',
        copyCode: 'Copy Code',
        copied: 'Code copied',
      },
      exporter: {
        title: 'Export data from German Vocab (old version)',
        intro:
          'Open this page in the browser you use for the old version, then click the button below to download everything it saved as a single JSON file. Data in the old version isn’t changed.',
        button: 'Export Data',
        done: 'Exported {keys} items ({pool} to practice, {archive} archived). Go back to the new app and choose the downloaded file in “Import from Old Version”.',
        empty:
          'No data from the old version was found. Make sure this is the browser you use for the old version; if it still isn’t found, use the console code offered in the new app instead.',
        unavailable:
          'This browser doesn’t allow reading local storage. Use the console code offered in the new app instead.',
      },
    },
    about: {
      header: 'About',
      version: (version: string) => `Version ${version}`,
      privacy:
        'Your lists and settings are stored only in this browser. During Device Sync, data travels directly between the two devices; the public pairing server is used only to exchange connection details and never receives your words.',
    },
  },
  entry: {
    section: (chapter: string, lesson: string) => `${chapter} · ${lesson}`,
    verbForm: { partizip2: 'Past participle', praeteritum: 'Simple past' },
  },
  words: {
    intro:
      'Paste or type a word list — text from a photo scan works too. The preview shows how each line is read. Saving replaces the practice list; the previous contents are kept as a snapshot.',
    editorLabel: 'Word list',
    editorDescription:
      'One entry per line: German first, then the meaning. Start a line with # for a chapter and ## for a lesson.',
    placeholder: [
      '# A1',
      '## Ein Apartment im Studentenwohnheim',
      'das Apartment (小型、单人居住的)公寓住房',
      'die Musik mst Sg, 音乐',
      'endlich Adv. 总算，终于，到底',
      'froh Adj. 高兴的，愉快的',
      'helfen - to help',
      'jm bei etw.(D.) helfen - to help someone with something',
    ].join('\n'),
    groups: {
      defaultChapter: 'My Words',
      defaultLesson: 'Current Set',
      untitledChapter: 'Untitled Chapter',
      untitledLesson: 'Untitled Lesson',
    },
    help: {
      title: 'Format Guide',
      subtitle: 'How to write chapters, lessons and entries',
      rules: {
        groups: {
          label: 'Chapters and lessons',
          format: '# Chapter name, ## Lesson name',
          example: '## Ein Apartment im Studentenwohnheim',
        },
        noun: {
          label: 'Nouns',
          format: 'Article + word + meaning',
          example: 'der Schrank 柜子',
        },
        special: {
          label: 'Special nouns',
          format: 'Article + word + nur Sg / mst Sg / Pl. + meaning',
          example: 'die Musik mst Sg, 音乐',
        },
        verb: { label: 'Verbs', format: 'Infinitive + meaning', example: 'einziehen 搬入' },
        modifier: {
          label: 'Adverbs and adjectives',
          format: 'Word + Adv. / Adj. + meaning',
          example: 'endlich Adv. 总算',
        },
        phrase: {
          label: 'Phrases',
          format: 'Whole phrase + meaning',
          example: 'jm bei etw.(D.) helfen 帮助某人',
        },
        verbForm: {
          label: 'Verb forms',
          format: 'Form + infinitive的二分词 (participle) / 的过去式 (preterite)',
          example: 'eingezogen einziehen的二分词',
        },
        separator: {
          label: 'Meanings in other languages',
          format: 'Separate with a tab, “ - ” or “：”',
          example: 'der Schrank - wardrobe',
        },
      },
      footnote:
        'Nouns must be answered with their article. Common scanning glitches (invisible characters, full-width letters, ligatures, bullets, table borders) are fixed automatically.',
    },
    preview: {
      header: 'Preview',
      filterLabel: 'Lines to show',
      all: 'All',
      problems: (count: number) => `Problems (${count})`,
      summary: (entries: number, chapters: number, lessons: number) =>
        [
          plural('en', entries, { one: `${entries} entry`, other: `${entries} entries` }),
          plural('en', chapters, { one: `${chapters} chapter`, other: `${chapters} chapters` }),
          plural('en', lessons, { one: `${lessons} lesson`, other: `${lessons} lessons` }),
        ].join(' · '),
      problemCount: (count: number) =>
        plural('en', count, {
          one: `${count} line not recognized`,
          other: `${count} lines not recognized`,
        }),
      duplicateCount: (count: number) =>
        plural('en', count, { one: `${count} duplicate line`, other: `${count} duplicate lines` }),
      updating: 'Updating preview…',
      empty: 'Once you enter a word list, each line will appear here.',
      noProblems: 'Every line was recognized.',
      line: (number: number) => `Line ${number}`,
      showMore: (count: number) =>
        plural('en', count, { one: `Show ${count} more line`, other: `Show ${count} more lines` }),
      alternatives: (answers: string) => `Also accepts ${answers}`,
      linkedForms: (forms: string) => `Forms: ${forms}`,
      repaired: 'Fixed',
      repairs: {
        invisible: 'Removed invisible characters',
        'table-border': 'Removed table borders',
        bullet: 'Removed bullets',
        'list-number': 'Removed list numbers',
        'full-width': 'Converted full-width letters',
        ligature: 'Split ligatures',
        'dropped-letter': 'Restored a letter lost in scanning',
      },
      problemText: {
        'no-prompt':
          'Missing meaning: add a meaning after the German, or separate it with “ - ” if it is not in Chinese or Japanese',
        'no-answer': 'Missing German: the meaning needs a German word in front of it',
        tooLong: (field: string, max: number) => `${field} is longer than ${max} characters`,
        overLimit: (max: number) => `Exceeds the limit of ${max} entries; this line won’t be saved`,
      },
      fields: {
        chapter: 'Chapter name',
        lesson: 'Lesson name',
        prompt: 'Meaning',
        answer: 'German',
      },
      duplicate: (line: number) => `Same as line ${line}; saved only once`,
      locate: (line: number) => `Go to line ${line} in the editor`,
    },
    actions: {
      discard: 'Discard Changes',
      save: 'Save and Practice',
    },
    shortcutHint: (keys: string) => `Press ${keys} to save`,
    discard: {
      title: 'Discard unsaved changes?',
      message: 'The word list will go back to the current practice list.',
      confirm: 'Discard Changes',
    },
    partial: {
      title: (count: number) =>
        plural('en', count, {
          one: `${count} line couldn’t be recognized`,
          other: `${count} lines couldn’t be recognized`,
        }),
      message: (entries: number) =>
        plural('en', entries, {
          one: `Only the ${entries} recognized entry will be saved. Unrecognized lines are ignored.`,
          other: `Only the ${entries} recognized entries will be saved. Unrecognized lines are ignored.`,
        }),
      confirm: 'Save Anyway',
      cancel: 'Keep Editing',
    },
    empty: {
      title: 'No valid words found',
      description:
        'Check the format: German first, then the meaning, one entry per line. Open the Format Guide for examples.',
    },
    saved: (count: number) =>
      plural('en', count, { one: `Saved ${count} entry`, other: `Saved ${count} entries` }),
    savedDescription:
      'The practice list was replaced. The previous contents were kept as a snapshot.',
    undone: 'Previous practice list restored',
    failed: 'Couldn’t save. Please try again.',
    conflict: {
      title: 'The practice list changed elsewhere',
      message:
        'Your edits are based on an older version. Load the latest contents (discarding your edits) or keep editing.',
      load: 'Load Latest',
      keep: 'Keep My Edits',
    },
    unsaved: 'Unsaved',
  },
  quiz: {
    restart: 'Restart',
    restarted: 'Restarted',
    restartedDescription: 'The questions have been reshuffled.',
    scope: {
      pool: 'All words to practice',
      archive: 'All archived words',
      combined: (sections: string) => `Combined · ${sections}`,
    },
    round: (round: number) => `Retest · Round ${round}`,
    lockedCount: (count: number) =>
      plural('en', count, { one: `${count} word`, other: `${count} words` }),
    progress: 'Round progress',
    questionIndex: (current: number, total: number) => `Question ${current} of ${total}`,
    questionAnnounce: (current: number, total: number, prompt: string) =>
      `Question ${current} of ${total}: ${prompt}`,
    correctCount: (count: number) => `${count} correct`,
    wrongCount: (count: number) => `${count} wrong`,
    wrongList: {
      title: 'Missed this round',
      empty: 'No mistakes so far.',
      yourInput: 'Your answer',
      answer: 'Correct answer',
    },
    instruction: 'Spell the matching German word or phrase',
    verbFormInstruction: {
      partizip2: 'Write the past participle of this verb',
      praeteritum: 'Write the simple past of this verb',
    },
    answerLabel: 'Your answer',
    placeholder: 'Type in German, e.g. der Schrank',
    specialCharacters: 'Special characters',
    submit: 'Check',
    next: 'Next',
    showResults: 'See Results',
    emptyAnswer: 'Type an answer first.',
    correct: {
      title: 'Correct!',
      standard: 'Standard form',
      announce: (answer: string) => `Correct. Standard form: ${answer}`,
    },
    wrong: {
      title: 'Not quite',
      yourInput: 'Your answer',
      answer: 'Correct answer',
      announce: (answer: string) => `Wrong. The correct answer is ${answer}`,
    },
    alternatives: 'Also accepted',
    empty: {
      title: 'No words to practice yet',
      description:
        'Paste or type a word list on the Word List page. The quiz starts as soon as you save it.',
      archiveDescription:
        'All of your words are archived. Import a new word list, or pick lessons from the archive to review.',
      words: 'Go to Word List',
      archive: 'Go to Archive',
    },
    result: {
      failedTitle: 'Round complete',
      passedTitle: 'Unit passed!',
      firstRoundFailed: (locked: number) =>
        `${plural('en', locked, { one: '1 word needs', other: `${locked} words need` })} more practice and ${plural('en', locked, { one: 'is', other: 'are' })} now locked in as your retest set.`,
      retestFailed: (locked: number) =>
        plural('en', locked, {
          one: 'Still a miss. To pass, get the word missed in round 1 right in a single retest.',
          other: `Still some misses. To pass, get all ${locked} words missed in round 1 right in a single retest.`,
        }),
      firstRoundPassed: 'Brilliant — a perfect score on the first try.',
      retestPassed: (locked: number) =>
        plural('en', locked, {
          one: 'Well done! You got the word missed in round 1 right in one retest. This unit is passed.',
          other: `Well done! You got all ${locked} words missed in round 1 right in one retest. This unit is passed.`,
        }),
      accuracy: 'Accuracy',
      score: 'Score',
      scoreValue: (correct: number, total: number) => `${correct} / ${total}`,
      wrongTitle: 'Missed Words',
      wrongCount: (count: number) =>
        plural('en', count, { one: '1 miss this round', other: `${count} misses this round` }),
      noInput: 'No answer',
      retest: (locked: number) =>
        `Retest Round 1 Misses (${plural('en', locked, { one: '1 word', other: `${locked} words` })})`,
      restartFull: 'Start Over',
      retestUnit: 'Test This Unit Again',
      archiveDescription: (count: number) =>
        plural('en', count, {
          one: 'The word in this unit passed. Archive it to move it out of the practice list.',
          other: `All ${count} words in this unit passed. Archive them to move them out of the practice list.`,
        }),
      archive: (count: number) =>
        `Archive Passed Unit (${plural('en', count, { one: '1 word', other: `${count} words` })})`,
      archived: (count: number) =>
        `${plural('en', count, { one: '1 word', other: `${count} words` })} from this unit ${plural('en', count, { one: 'is', other: 'are' })} in the archive.`,
      notInPool: 'These words are no longer in the practice list.',
      newWords: 'Add New Words',
      viewArchive: 'View Archive',
      archiveReviewDescription: (count: number) =>
        plural('en', count, {
          one: 'The archived word was reviewed correctly. No need to archive it again.',
          other: `All ${count} archived words were reviewed correctly. No need to archive them again.`,
        }),
      done: 'Done',
      archivedToast: (count: number) =>
        `${plural('en', count, { one: '1 word', other: `${count} words` })} archived`,
      archivedToastDescription: 'Moved from the practice list to the archive.',
      archiveUndone: 'Archiving undone',
      archiveFailed: 'Couldn’t archive',
    },
  },
  speech: {
    speak: 'Listen',
    speakWord: (word: string) => `Pronounce ${word}`,
  },
  archive: {
    stats: (entries: number, chapters: number) =>
      [
        plural('en', entries, {
          one: `${entries} archived word`,
          other: `${entries} archived words`,
        }),
        plural('en', chapters, { one: `${chapters} chapter`, other: `${chapters} chapters` }),
      ].join(' · '),
    search: {
      label: 'Search archive',
      placeholder: 'Search words, meanings or chapters',
    },
    empty: {
      title: 'Nothing Archived Yet',
      description: 'Pass a whole unit with 100% in a quiz, then archive it here in one tap.',
      action: 'Go to Quiz',
    },
    noResults: {
      title: 'No Results',
      description: (query: string) => `No words, meanings or chapters match “${query}”.`,
    },
    resultCount: (count: number) =>
      plural('en', count, { one: `${count} word found`, other: `${count} words found` }),
    wordCount: (count: number) =>
      plural('en', count, { one: `${count} word`, other: `${count} words` }),
    lessonCount: (count: number) =>
      plural('en', count, { one: `${count} lesson`, other: `${count} lessons` }),
    testChapter: 'Test Chapter',
    testLesson: 'Test Lesson',
    testChapterLabel: (chapter: string) => `Test Chapter: ${chapter}`,
    testLessonLabel: (lesson: string) => `Test Lesson: ${lesson}`,
    archivedOn: (date: string) => `Archived ${date}`,
    mastered: 'Mastered',
    review: {
      replaced: 'Your unfinished quiz was set aside',
      replacedDescription: 'Undo to return to where you left off.',
      restored: 'Back to your previous quiz',
    },
    manage: {
      label: 'Manage',
      hint: 'Click once for edit mode, twice for delete mode',
      modes: { edit: 'Edit', delete: 'Delete' },
      editBanner:
        'Edit mode: double-click a word to change it. Use the pencil buttons to rename chapters and lessons.',
      deleteBanner:
        'Delete mode: use the delete buttons to remove words, lessons or whole chapters.',
      toDelete: 'Switch to Delete Mode',
      toEdit: 'Switch to Edit Mode',
      done: 'Done',
    },
    combo: {
      toggle: 'Combined Test',
      exit: 'Exit Combined',
      hint: 'Select the lessons to test together (one is fine too).',
      selected: (count: number) =>
        plural('en', count, {
          one: `${count} lesson selected`,
          other: `${count} lessons selected`,
        }),
      start: 'Start Combined Test',
      select: (section: string) => `Select ${section}`,
    },
    reorder: {
      chapter: (name: string) => `Reorder chapter “${name}”`,
      lesson: (name: string) => `Reorder lesson “${name}”`,
      hint: 'Drag to reorder, or use the Up and Down arrow keys. Home and End move to the start or end.',
      moved: (name: string, position: number, total: number) =>
        `“${name}” moved to position ${position} of ${total}`,
      failed: 'Couldn’t save the new order',
    },
    edit: {
      title: 'Edit Word',
      label: (word: string) => `Edit “${word}”`,
      answer: 'German',
      alternatives: 'Other Accepted Answers',
      alternativesDescription: 'One per line. Any of them counts as correct.',
      prompt: 'Meaning',
      save: 'Save',
      saved: 'Changes saved',
      undone: 'Changes undone',
      errors: {
        missing: 'This word is no longer in the archive.',
        answerRequired: 'Enter the German word.',
        promptRequired: 'Enter the meaning.',
        tooManyAnswers: (limit: number) => `A word can have at most ${limit} answers.`,
        invalid: 'This is too long. Shorten it and try again.',
      },
    },
    rename: {
      chapterTitle: 'Rename Chapter',
      lessonTitle: 'Rename Lesson',
      chapterLabel: (name: string) => `Rename chapter “${name}”`,
      lessonLabel: (name: string) => `Rename lesson “${name}”`,
      name: 'Name',
      chapterDescription: 'A chapter with the same name in your practice list is renamed too.',
      lessonDescription: 'A lesson with the same name in your practice list is renamed too.',
      save: 'Save',
      renamed: (name: string) => `Renamed to “${name}”`,
      undone: 'Rename undone',
      errors: {
        nameRequired: 'Enter a name.',
        nameTooLong: (limit: number) => `Names can be at most ${limit} characters long.`,
        chapterTaken: 'The archive already has a chapter with this name.',
        lessonTaken: 'This chapter already has a lesson with this name.',
      },
    },
    remove: {
      entryLabel: (word: string) => `Delete “${word}”`,
      chapterLabel: (name: string) => `Delete chapter “${name}”`,
      lessonLabel: (name: string) => `Delete lesson “${name}”`,
      entryTitle: 'Delete This Word?',
      chapterTitle: 'Delete Whole Chapter?',
      lessonTitle: 'Delete This Lesson?',
      entryMessage: (word: string) => `“${word}” will be removed from the archive.`,
      groupMessage: (name: string, count: number) =>
        plural('en', count, {
          one: `“${name}” and its ${count} word will be removed from the archive. A snapshot is saved first.`,
          other: `“${name}” and its ${count} words will be removed from the archive. A snapshot is saved first.`,
        }),
      confirm: 'Delete',
      removed: (count: number) =>
        plural('en', count, { one: `Deleted ${count} word`, other: `Deleted ${count} words` }),
      undone: 'Deletion undone',
    },
    failed: 'Something went wrong. Please try again.',
  },
  sync: {
    title: 'Device Sync',
    openFromEmpty: 'Sync from Another Device',
    status: { connecting: 'Connecting', connected: 'Connected', ended: 'Disconnected' },
    unsupported: {
      title: 'This browser can’t connect to other devices',
      description: 'Device Sync requires WebRTC. Try the latest Safari, Chrome, Edge, or Firefox.',
    },
    role: {
      prompt: 'What should this device do?',
      send: 'Send to Another Device',
      sendDescription: 'Replace the other device’s archive with this one',
      receive: 'Receive from Another Device',
      receiveDescription: 'Replace this device’s archive with the other one',
      footer:
        'Open Device Sync on both devices: one sends, the other receives. Only the archive is synced; your Practice List is not affected.',
      label: 'This device',
      sendShort: 'Send',
      receiveShort: 'Receive',
      pendingCode: (code: string) =>
        `After you choose, this device will connect to pairing code ${code}.`,
    },
    pairing: {
      codeHeader: 'Pairing Code for This Device',
      codeLabel: (digits: string) => `Pairing code: ${digits}`,
      preparing: 'Connecting to the pairing server…',
      hint: 'Enter or scan this code on the other device, or enter the other device’s code below.',
      copy: 'Copy',
      copyLabel: 'Copy pairing code',
      copied: 'Pairing code copied',
      copyFailed: 'Couldn’t copy. Please enter the code manually.',
      qrLabel: 'Pairing QR code',
      joinHeader: 'Connect to Another Device',
      codeField: 'Other device’s code',
      codePlaceholder: '6 digits',
      invalid: 'Enter 6 digits',
      ownCode: 'This is this device’s own code. Enter the code shown on the other device.',
      connect: 'Connect',
      scan: 'Scan QR Code',
      joining: (code: string) => `Connecting to ${code}…`,
    },
    scanner: {
      label: 'Camera viewfinder',
      hint: 'Fit the pairing QR code from the other device inside the frame',
      starting: 'Opening camera…',
      stop: 'Stop Scanning',
      denied:
        'The camera can’t be used. Allow camera access in your browser settings, or enter the code manually.',
      unavailable: 'Couldn’t open the camera. Please enter the code manually.',
      legacy:
        'This QR code is from the old version. The new version can’t sync with it — open the new version on both devices.',
      invalid: 'This isn’t a pairing QR code',
    },
    problems: {
      'signaling-unavailable':
        'Couldn’t reach the pairing server. Check your connection and try again.',
      'no-peer':
        'No answer. Make sure the code is correct and Device Sync is still open on the other device.',
      busy: 'The other device is syncing with another device. Try again later.',
      'same-role': 'Both devices chose the same role. Switch one of them to the other role.',
      'peer-same-role':
        'A device with the same role tried to connect. Switch one of them to the other role.',
      version:
        'The other device runs an incompatible version. Update both devices to the latest version.',
      'p2p-failed':
        'Couldn’t connect the two devices directly. Try putting both on the same Wi-Fi and try again.',
      'peer-cancelled': 'The other device cancelled the connection.',
    },
    retry: 'Try Again',
    switchTo: { send: 'Switch to Send', receive: 'Switch to Receive' },
    connecting: {
      title: 'Connecting directly…',
      description: 'Data travels only between the two devices and never passes through a server.',
    },
    peer: (device: string) => `Connected to ${device}`,
    peerUnknown: 'Connected to another device',
    disconnect: 'Disconnect',
    send: {
      scopeLabel: 'What to sync',
      full: 'Entire Archive',
      lessons: 'By Lesson',
      fullDescription: (entries: number, chapters: number) =>
        `The other device’s entire archive will be replaced with ${plural('en', entries, { one: `${entries} archived word`, other: `${entries} archived words` })} (${plural('en', chapters, { one: `${chapters} chapter`, other: `${chapters} chapters` })}) from this device.`,
      lessonsDescription:
        'Only the selected lessons are replaced on the other device; its other lessons stay unchanged.',
      lessonsHeader: 'Choose Lessons',
      selectAll: 'Select All',
      clearAll: 'Select None',
      selection: (lessons: number, entries: number) =>
        `${plural('en', lessons, { one: `${lessons} lesson`, other: `${lessons} lessons` })} · ${plural('en', entries, { one: `${entries} word`, other: `${entries} words` })} selected`,
      wordCount: (count: number) =>
        plural('en', count, { one: `${count} word`, other: `${count} words` }),
      empty: 'The archive on this device is empty — there are no words to send.',
      push: (count: number) =>
        plural('en', count, { one: `Send ${count} Word`, other: `Send ${count} Words` }),
      sending: 'Sending…',
      awaiting: 'Delivered. Waiting for the other device to confirm…',
      cancel: 'Cancel Sending',
      results: {
        applied: (count: number) =>
          plural('en', count, {
            one: `The other device received ${count} word`,
            other: `The other device received ${count} words`,
          }),
        declined: 'The other device declined this sync',
        invalid: 'The data didn’t pass validation and wasn’t used',
        failed: 'The other device couldn’t save the data; its library is unchanged',
        busy: 'The other device is busy. Try again later.',
        cancelled: 'Sending cancelled',
        interrupted: 'Transfer interrupted; the other device’s library is unchanged',
      },
    },
    receive: {
      waiting: 'Waiting for the other device to send…',
      waitingDescription: 'You’ll see a preview here first. Nothing is saved until you confirm.',
      receiving: 'Receiving…',
      previewHeader: 'Confirm Sync',
      modes: { full: 'Replace entire archive', lessons: 'Replace selected lessons' },
      incoming: (entries: number, lessons: number) =>
        `${plural('en', entries, { one: `${entries} word`, other: `${entries} words` })} · ${plural('en', lessons, { one: `${lessons} lesson`, other: `${lessons} lessons` })} received`,
      replaced: 'Words replaced on this device',
      added: 'New',
      removed: 'Removed',
      unchanged: 'Unchanged',
      wordCount: (count: number) =>
        plural('en', count, { one: `${count} word`, other: `${count} words` }),
      lessonsHeader: 'Affected Lessons',
      lessonChange: (current: number, incoming: number) => `${current} → ${incoming} words`,
      newLesson: (incoming: number) =>
        plural('en', incoming, {
          one: `New lesson · ${incoming} word`,
          other: `New lesson · ${incoming} words`,
        }),
      removedLesson: (current: number) =>
        plural('en', current, {
          one: `Will be removed · ${current} word`,
          other: `Will be removed · ${current} words`,
        }),
      moreLessons: (count: number) =>
        plural('en', count, { one: `${count} more lesson`, other: `${count} more lessons` }),
      footer:
        'A snapshot is saved automatically before anything is replaced, so you can undo. Your Practice List is not affected.',
      accept: 'Receive and Replace',
      decline: 'Decline',
      applying: 'Saving…',
      results: {
        applied: (count: number) =>
          plural('en', count, { one: `Received ${count} word`, other: `Received ${count} words` }),
        unchanged: 'Same content — nothing changed on this device',
        declined: 'Sync declined',
        invalid: 'The data was incomplete or malformed and was discarded',
        failed: 'Couldn’t save; the library on this device is unchanged',
        busy: 'This device was busy and didn’t receive the data',
        cancelled: 'The other device cancelled sending',
        interrupted: 'Transfer interrupted; the library on this device is unchanged',
      },
      undo: 'Undo',
      undone: 'Sync undone',
      undoFailed: 'Couldn’t undo: the snapshot no longer exists',
    },
    ended: {
      'peer-left': 'The other device disconnected',
      'connection-lost': 'The connection was lost',
      disconnected: 'Disconnected',
      reconnect: 'Pair Again',
    },
    leave: {
      title: 'Stop Syncing?',
      message:
        'Data is being transferred or awaiting confirmation. Closing or disconnecting now will stop this sync.',
      confirm: 'Stop and Close',
      confirmDisconnect: 'Stop and Disconnect',
    },
  },
  gallery: {
    title: 'Design System',
    subtitle: 'Design tokens and components (development only)',
    sections: {
      colors: 'Color',
      typography: 'Typography',
      radius: 'Continuous corners',
      spacing: 'Spacing',
      shadows: 'Shadows',
      materials: 'Glass materials',
      buttons: 'Buttons',
      inputs: 'Inputs',
      selection: 'Selection controls',
      overlays: 'Overlays',
      navigation: 'Navigation',
      content: 'Content',
      glass: 'Liquid Glass Lab',
      motion: 'Motion Lab',
    },
    contrast: (ratio: string) => `Contrast ${ratio}:1`,
    sample: 'wardrobe · der Schrank',
    variants: {
      glass: 'Glass',
      filled: 'Filled',
      tinted: 'Tinted',
      plain: 'Plain',
      destructive: 'Delete',
      pending: 'Submitting',
      disabled: 'Disabled',
      small: 'Small',
      large: 'Large',
    },
    answerLabel: 'Your answer',
    answerDescription: 'Nouns need their article; capitalization is ignored.',
    answerError: 'Misspelled',
    searchLabel: 'Search archive',
    searchPlaceholder: 'Search words, meanings or chapters',
    notesLabel: 'Paste word list',
    specialKeys: 'Special characters',
    switchLabel: 'Read aloud after a correct answer',
    checkboxLabel: 'Select this lesson',
    segmentedLabel: 'Overwrite mode',
    segmentedFull: 'Entire library',
    segmentedSelective: 'By lesson',
    sliderLabel: 'Speech rate',
    menuLabel: 'More actions',
    menuRestart: 'Start over',
    menuSpeak: 'Read word aloud',
    menuDelete: 'Delete lesson',
    popoverTrigger: '2 mistakes this round',
    popoverTitle: 'Mistakes this round',
    dialogTrigger: 'Delete lesson',
    dialogTitle: 'Delete this lesson permanently?',
    dialogMessage: '24 archived words will be removed. You can undo this from the notification.',
    sheetTrigger: 'Open sheet',
    sheetTitle: 'Device sync',
    sheetBody:
      'Tap the handle (or focus it and press Enter) to switch between the medium and large detents. Drag gestures arrive in stage 5.',
    toastTrigger: 'Show notification',
    toastTitle: '24 words archived',
    toastDescription: 'Lesson 30 · Ein Apartment im Studentenwohnheim',
    cardTitle: 'Lesson 30',
    cardSubtitle: 'Ein Apartment im Studentenwohnheim',
    listHeader: 'Pronunciation',
    listFooter: 'Speech uses the German voice built into your device.',
    listVoice: 'Voice',
    listVoiceValue: 'Anna',
    listTest: 'Preview',
    progressLabel: 'Quiz progress',
    emptyTitle: 'No archived words yet',
    emptyDescription: 'Master an entire unit to archive it.',
    wordCount: (count: number) =>
      plural('en', count, { one: `${count} word`, other: `${count} words` }),
    sidebarDemo: 'Sidebar example',
    disclosureTitle: 'Chapter 1 · Wohnen',
    disclosureSubtitle: '3 lessons',
    disclosureBody: 'Expand to see the lessons and archived words in this chapter.',
    disclosureSecondTitle: 'Chapter 2 · Freizeit',
    tones: {
      neutral: 'Neutral',
      tint: 'Accent',
      success: 'Correct',
      danger: 'Wrong',
      warning: 'Attention',
    },
    tabBarDemo: 'Tab bar example',
    motion: {
      description:
        'Every animation is driven by an interruptible spring: grab it anytime, reverse it, and velocity stays continuous; releasing inherits your finger’s speed. With Reduce Motion on, only fades remain.',
      flingTitle: 'Fling and snap',
      flingHint:
        'Drag the glass puck and fling it: it projects your velocity and snaps to the nearest corner. Arrow keys move it too.',
      puckLabel: (corner: string) => `Glass puck, resting at the ${corner}`,
      corners: {
        topLeft: 'top left',
        topRight: 'top right',
        bottomLeft: 'bottom left',
        bottomRight: 'bottom right',
      },
      velocity: (speed: string) => `Release velocity ${speed} px/s`,
      mergeTitle: 'Droplet merge',
      mergeHint:
        'Drag the two glass droplets together: with WebGL they fuse like liquid, then spring back when released (CSS glass only overlaps).',
      merge: 'Merge',
      separate: 'Separate',
    },
    glass: {
      description:
        'Tune the Liquid Glass optics live. The WebGL tier refracts the animated wallpaper only; fixed chrome such as the tab bar and sidebar always uses CSS glass.',
      tierLabel: (tier: string) => `Current tier: ${tier}`,
      preferenceLabel: 'Rendering tier',
      variantLabel: 'Glass variant',
      variants: {
        regular: 'Regular',
        clear: 'Clear',
        prominent: 'Prominent',
        chrome: 'Chrome',
        thick: 'Thick',
      },
      refraction: 'Refraction',
      bezel: 'Bezel width',
      dispersion: 'Dispersion',
      fresnel: 'Fresnel',
      specular: 'Specular',
      spacing: 'Merge radius',
      gap: 'Gap between shapes',
      pointer: 'Pointer highlight',
      stageLabel: 'Glass preview',
      cardCaption: 'wardrobe',
    },
  },
} satisfies Messages;
