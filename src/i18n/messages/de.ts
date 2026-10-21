import { plural } from '../plural';
import type { Messages } from './types';

export const de = {
  meta: {
    appName: 'Deutsch-Vokabeltrainer',
    appDescription: 'Gelernte deutsche Wörter abfragen und festhalten',
  },
  common: {
    close: 'Schließen',
    cancel: 'Abbrechen',
    confirm: 'OK',
    clear: 'Löschen',
    loading: 'Wird geladen …',
    more: 'Mehr',
    undo: 'Rückgängig',
    done: 'Fertig',
    delete: 'Löschen',
    search: 'Suchen',
  },
  nav: {
    primary: 'Hauptnavigation',
    quiz: 'Abfrage',
    archive: 'Archiv',
    wordList: 'Wortliste',
    settings: 'Einstellungen',
    skipToContent: 'Zum Hauptinhalt springen',
    collapseSidebar: 'Seitenleiste einklappen',
    expandSidebar: 'Seitenleiste ausklappen',
  },
  pwa: {
    updateReady: 'Neue Version verfügbar',
    updateReadyDescription: 'Neu laden zum Aktualisieren. Wörter und Fortschritt bleiben erhalten.',
    reload: 'Neu laden',
  },
  overlay: {
    sheetHandle: 'Fenstergröße ändern',
    notifications: 'Mitteilungen',
    dismissNotification: 'Mitteilung schließen',
  },
  locale: {
    label: 'Sprache',
  },
  data: {
    saveFailed: 'Änderungen konnten nicht gespeichert werden',
    saveFailedReason: {
      quota:
        'Der Gerätespeicher ist voll. Gib etwas Speicherplatz frei und versuche es erneut – schließe die Seite bis dahin nicht.',
      version:
        'Deine Daten werden jetzt von einer neueren Version der App verwaltet. Lade die Seite neu, bevor du Änderungen vornimmst.',
      unavailable:
        'Die Verbindung zum lokalen Speicher wurde getrennt. Versuche es erneut oder lade die Seite neu, falls es weiterhin fehlschlägt.',
      unknown:
        'Deine Änderungen sind noch auf dieser Seite vorhanden. Versuche es erneut und stelle vor dem Schließen sicher, dass sie gespeichert sind.',
    },
    retry: 'Erneut versuchen',
    saveRecovered: 'Änderungen gespeichert',
    storageUnavailable: 'Lokaler Speicher nicht verfügbar',
    storageUnavailableReason: {
      quota:
        'Der Gerätespeicher ist voll, daher kann die lokale Datenbank nicht geöffnet werden. Änderungen bleiben nur bis zum Schließen der Seite erhalten.',
      version:
        'Deine Daten wurden von einer neueren Version der App gespeichert. Lade die Seite neu, um sie zu verwenden; bis dahin werden Änderungen nicht gespeichert.',
      unavailable:
        'Dieser Browser erlaubt der Website nicht, Daten zu speichern (z. B. im privaten Modus). Änderungen bleiben nur bis zum Schließen der Seite erhalten.',
      unknown:
        'Die lokale Datenbank konnte nicht geöffnet werden. Änderungen bleiben nur bis zum Schließen der Seite erhalten.',
    },
    quarantined: (count: number) =>
      plural('de', count, {
        one: `${count} nicht erkannter Eintrag gefunden`,
        other: `${count} nicht erkannte Einträge gefunden`,
      }),
    quarantinedDescription:
      'Sie wurden unverändert aufbewahrt. In den Einstellungen kannst du sie exportieren oder löschen.',
    review: 'Ansehen',
    legacy: {
      found: 'Daten der alten Version gefunden',
      foundDescription:
        'Deine Listen sind nicht leer, daher wurde nichts automatisch importiert. In den Einstellungen kannst du zusammenführen oder ersetzen.',
      review: 'Zu den Einstellungen',
      migrated: 'Daten der alten Version übernommen',
      migratedDescription: (counts: string, rejected: number) =>
        rejected > 0
          ? `${counts}. ${plural('de', rejected, { one: `${rejected} nicht erkannter Datensatz wurde`, other: `${rejected} nicht erkannte Datensätze wurden` })} unverändert aufbewahrt – siehe Einstellungen.`
          : counts,
    },
  },
  glass: {
    tiers: {
      webgl: 'WebGL-Brechung',
      refraction: 'CSS-Brechung',
      blur: 'Nur Unschärfe',
      opaque: 'Deckend',
    },
    preferences: {
      auto: 'Automatisch',
      refraction: 'CSS-Brechung',
      blur: 'Nur Unschärfe',
      opaque: 'Deckend',
    },
  },
  settings: {
    general: {
      header: 'Allgemein',
      glass: 'Glaseffekt',
      glassFooter: (tier: string) =>
        `Aktuell: ${tier}. „Automatisch“ wählt anhand der Geräteleistung und der Systemeinstellungen „Transparenz reduzieren“ und „Bewegung reduzieren“.`,
    },
    speech: {
      header: 'Aussprache',
      rate: 'Sprechtempo',
      rateValue: (rate: string) => `${rate}×`,
      voice: 'Stimme',
      automatic: 'Automatisch',
      voiceLabel: (name: string) => `Stimme: ${name}`,
      voiceName: (name: string, lang: string) => `${name} (${lang})`,
      noVoices: 'Keine deutschen Stimmen',
      preview: 'Probehören',
      footer:
        '„Automatisch“ bevorzugt auf dem Gerät installierte Stimmen: Sie funktionieren offline und sprechen schneller los. Fehlt eine deutsche Stimme, kannst du sie in den Sprach- oder Bedienungshilfen-Einstellungen des Systems hinzufügen.',
      unavailable: 'Dieser Browser unterstützt keine Sprachausgabe',
      notSaved: 'Einstellung nicht gespeichert. Sie gilt, bis du die Seite schließt.',
    },
    data: {
      header: 'Daten',
      storage: 'Lokaler Speicher',
      storageKind: {
        indexeddb: 'In diesem Browser gespeichert',
        memory: 'Nur diese Sitzung – geht beim Schließen der Seite verloren',
      },
      persistence: {
        saved: 'Gespeichert',
        saving: 'Wird gespeichert …',
        failed: 'Nicht gespeichert',
      },
      words: 'Wörter',
      wordCounts: (pool: number, archive: number) => `${pool} zum Üben · ${archive} archiviert`,
      exportText: 'Als Text exportieren …',
      importLegacy: 'Aus alter Version importieren …',
      sync: 'Geräte-Sync …',
    },
    quarantine: {
      header: 'Nicht erkannte Daten',
      footer:
        'Diese Daten sind fehlerhaft und konnten nicht geladen werden, wurden aber unverändert aufbewahrt. Exportiere sie, um den Inhalt zu prüfen oder Hilfe bei der Wiederherstellung zu bekommen.',
      count: (count: number) =>
        plural('de', count, { one: `${count} Eintrag`, other: `${count} Einträge` }),
      export: 'Als JSON exportieren',
      exported: 'Exportiert',
      clear: 'Löschen …',
      clearTitle: 'Nicht erkannte Daten löschen?',
      clearMessage: (count: number) =>
        plural('de', count, {
          one: `${count} Eintrag wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden. Exportiere am besten vorher eine Sicherung.`,
          other: `${count} Einträge werden endgültig gelöscht. Das kann nicht rückgängig gemacht werden. Exportiere am besten vorher eine Sicherung.`,
        }),
      cleared: 'Nicht erkannte Daten gelöscht',
      failed: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
    },
    snapshots: {
      header: 'Schnappschüsse',
      footer: (limit: number) =>
        `Vor dem Ersetzen der Übungsliste, dem Archivieren einer Einheit, dem Löschen von Lektionen oder Kapiteln aus dem Archiv, dem Empfangen einer Synchronisierung oder dem Importieren von Daten wird automatisch ein Schnappschuss gespeichert. Die letzten ${limit} werden aufbewahrt.`,
      empty: 'Noch keine Schnappschüsse',
      reasons: {
        'replace-pool': 'Vor dem Ersetzen der Übungsliste',
        archive: 'Vor dem Archivieren einer Einheit',
        delete: 'Vor dem Löschen aus dem Archiv',
        sync: 'Vor dem Empfangen der Synchronisierung',
        import: 'Vor dem Importieren',
        restore: 'Vor dem Wiederherstellen',
        'legacy-backup': 'Alte Version: vor dem Empfangen einer Synchronisierung',
      },
      restore: 'Wiederherstellen',
      restoreLabel: (reason: string, time: string) => `„${reason}“ wiederherstellen (${time})`,
      restoreTitle: 'Diesen Schnappschuss wiederherstellen?',
      restoreMessage: (time: string) =>
        `Übungsliste und Archiv werden auf den Stand vom ${time} zurückgesetzt. Der aktuelle Inhalt wird vorher als Schnappschuss gespeichert.`,
      restored: 'Schnappschuss wiederhergestellt',
      undone: 'Wiederherstellung rückgängig gemacht',
      missing: 'Dieser Schnappschuss existiert nicht mehr',
      failed: 'Schnappschuss konnte nicht wiederhergestellt werden',
    },
    exportText: {
      title: 'Als Text exportieren',
      collection: 'Inhalt',
      collections: { archive: 'Archiv', pool: 'Übungsliste' },
      preview: 'Vorschau',
      summary: (count: number) =>
        plural('de', count, { one: `${count} Wort`, other: `${count} Wörter` }),
      empty: (collection: string) => `${collection}: noch keine Wörter.`,
      copy: 'Kopieren',
      copied: 'In die Zwischenablage kopiert',
      copyFailed: 'Kopieren nicht möglich. Markiere den Text und kopiere ihn manuell.',
      download: '.txt herunterladen',
      downloaded: 'Download gestartet',
      footer:
        'Gleiches Format wie auf der Seite „Wortliste“: Du kannst den Text direkt wieder in die Wortliste einfügen oder als Sicherung aufbewahren.',
    },
    legacy: {
      title: 'Aus alter Version importieren',
      intro:
        'Importiert Übungsliste, Archiv und Archivreihenfolge, die die ursprüngliche Version (eine einzelne HTML-Datei) gespeichert hat. Die Daten der alten Version bleiben unverändert.',
      source: 'Quelle',
      local: 'Daten der alten Version auf diesem Gerät',
      localDescription: 'Unter dieser Adresse gefunden',
      choose: 'Verwenden',
      chosen: 'Ausgewählt',
      file: 'Exportdatei',
      fileDescription: 'JSON-Datei vom Exportwerkzeug oder vom Konsolencode',
      chooseFile: 'Datei wählen …',
      selectedFile: (name: string) => `Ausgewählt: ${name}`,
      errors: {
        'invalid-json': 'Diese Datei ist kein gültiges JSON.',
        'no-legacy-data': 'Diese Datei enthält keine Daten der alten Version.',
        'too-large': 'Diese Datei ist zu groß für einen Export der alten Version.',
        'read-failed': 'Diese Datei kann nicht gelesen werden.',
      },
      preview: 'Vorschau',
      pool: 'Übungsliste',
      archive: 'Archiv',
      backup: 'Sicherung vor einer Synchronisierung',
      words: (count: number) =>
        plural('de', count, { one: `${count} Wort`, other: `${count} Wörter` }),
      archiveValue: (entries: number, chapters: number) =>
        `${plural('de', entries, { one: `${entries} Wort`, other: `${entries} Wörter` })} · ${chapters} Kapitel`,
      notes: {
        nothing: 'Die alten Daten enthalten keine Wörter.',
        bareNouns: (count: number) =>
          `Bei ${count} Nomen wurden Antworten ohne Artikel entfernt (Nomen brauchen jetzt den Artikel).`,
        synthetic: (count: number) =>
          plural('de', count, {
            one: `${count} automatisch erzeugte „Grundform“-Frage wurde übersprungen (auch die alte Version zeigt sie nicht an).`,
            other: `${count} automatisch erzeugte „Grundform“-Fragen wurden übersprungen (auch die alte Version zeigt sie nicht an).`,
          }),
        rejected: (count: number) =>
          plural('de', count, {
            one: `${count} nicht erkannter Datensatz wird unverändert aufbewahrt und kann in den Einstellungen exportiert werden.`,
            other: `${count} nicht erkannte Datensätze werden unverändert aufbewahrt und können in den Einstellungen exportiert werden.`,
          }),
      },
      mode: 'Importart',
      modes: { merge: 'Zusammenführen', replace: 'Ersetzen' },
      modeDescriptions: {
        merge:
          'Behält deine Wörter und fügt nur neue hinzu; Wörter mit gleicher Aufgabe und gleichen Antworten in derselben Lektion gelten als vorhanden. Vorher wird ein Schnappschuss gespeichert, du kannst also rückgängig machen.',
        replace:
          'Ersetzt Übungsliste und Archiv durch die alten Daten. Vorher wird ein Schnappschuss gespeichert, du kannst also rückgängig machen.',
      },
      import: 'Importieren',
      imported: 'Alte Daten importiert',
      importedDescription: (counts: string, duplicates: number) =>
        duplicates > 0
          ? `Hinzugefügt: ${counts}; ${plural('de', duplicates, { one: `${duplicates} vorhandenes Wort`, other: `${duplicates} vorhandene Wörter` })} übersprungen`
          : `Hinzugefügt: ${counts}`,
      tooMany: (limit: number) =>
        `Beim Zusammenführen würde die Grenze von ${limit} Wörtern pro Liste überschritten. Verwende stattdessen „Ersetzen“.`,
      failed: 'Import fehlgeschlagen. Bitte versuche es erneut.',
      undone: 'Import rückgängig gemacht',
      undoFailed: 'Import konnte nicht rückgängig gemacht werden',
      help: {
        title: 'Wie exportiere ich Daten aus der alten Version?',
        steps: [
          'Lade das Exportwerkzeug herunter und speichere es auf dem Computer mit der alten HTML-Datei.',
          'Öffne das Exportwerkzeug in dem Browser, in dem du die alte Version verwendest, und klicke auf „Daten exportieren“.',
          'Kehre hierher zurück und wähle die heruntergeladene JSON-Datei.',
        ],
        download: 'Exportwerkzeug herunterladen',
        consoleIntro:
          'Findet das Exportwerkzeug keine Daten (Firefox trennt zum Beispiel den Speicher jeder lokalen Datei): Öffne die alte Version, drücke F12, wechsle in den Entwicklerwerkzeugen zur „Konsole“, füge den folgenden Code ein und drücke die Eingabetaste.',
        consoleLabel: 'Konsolencode',
        copyCode: 'Code kopieren',
        copied: 'Code kopiert',
      },
      exporter: {
        title: 'Daten aus dem Deutsch-Vokabeltrainer (alte Version) exportieren',
        intro:
          'Öffne diese Seite in dem Browser, in dem du die alte Version verwendest, und klicke auf die Schaltfläche, um alle gespeicherten Daten als eine JSON-Datei herunterzuladen. Die Daten der alten Version bleiben unverändert.',
        button: 'Daten exportieren',
        done: '{keys} Einträge exportiert ({pool} zum Üben, {archive} archiviert). Wähle die heruntergeladene Datei in der neuen App unter „Aus alter Version importieren“.',
        empty:
          'Keine Daten der alten Version gefunden. Prüfe, ob dies der Browser ist, in dem du die alte Version verwendest; andernfalls nutze den Konsolencode aus der neuen App.',
        unavailable:
          'Dieser Browser erlaubt keinen Zugriff auf den lokalen Speicher. Nutze stattdessen den Konsolencode aus der neuen App.',
      },
    },
    about: {
      header: 'Info',
      version: (version: string) => `Version ${version}`,
      privacy:
        'Deine Listen und Einstellungen werden nur in diesem Browser gespeichert. Beim Geräte-Sync werden die Daten direkt zwischen den beiden Geräten übertragen; der öffentliche Kopplungsserver dient nur zum Austausch der Verbindungsdaten und erhält deine Wörter nie.',
    },
  },
  entry: {
    section: (chapter: string, lesson: string) => `${chapter} · ${lesson}`,
    verbForm: { partizip2: 'Partizip II', praeteritum: 'Präteritum' },
  },
  words: {
    intro:
      'Füge eine Wortliste ein oder tippe sie ab – auch Text aus einem Foto-Scan funktioniert. Die Vorschau zeigt, wie jede Zeile erkannt wird. Beim Speichern wird die Übungsliste ersetzt; der bisherige Inhalt bleibt als Schnappschuss erhalten.',
    editorLabel: 'Wortliste',
    editorDescription:
      'Ein Eintrag pro Zeile: zuerst Deutsch, dann die Bedeutung. # leitet ein Kapitel ein, ## eine Lektion.',
    placeholder: [
      '# A1',
      '## Ein Apartment im Studentenwohnheim',
      'das Apartment (小型、单人居住的)公寓住房',
      'die Musik mst Sg, 音乐',
      'endlich Adv. 总算，终于，到底',
      'froh Adj. 高兴的，愉快的',
      'helfen - to help',
      'jm bei etw.(D.) helfen - jemandem bei etwas helfen',
    ].join('\n'),
    groups: {
      defaultChapter: 'Eigene Wörter',
      defaultLesson: 'Aktuelle Liste',
      untitledChapter: 'Unbenanntes Kapitel',
      untitledLesson: 'Unbenannte Lektion',
    },
    help: {
      title: 'Formathilfe',
      subtitle: 'So schreibst du Kapitel, Lektionen und Einträge',
      rules: {
        groups: {
          label: 'Kapitel und Lektionen',
          format: '# Kapitelname, ## Lektionsname',
          example: '## Ein Apartment im Studentenwohnheim',
        },
        noun: {
          label: 'Nomen',
          format: 'Artikel + Wort + Bedeutung',
          example: 'der Schrank 柜子',
        },
        special: {
          label: 'Besondere Nomen',
          format: 'Artikel + Wort + nur Sg / mst Sg / Pl. + Bedeutung',
          example: 'die Musik mst Sg, 音乐',
        },
        verb: { label: 'Verben', format: 'Infinitiv + Bedeutung', example: 'einziehen 搬入' },
        modifier: {
          label: 'Adverbien und Adjektive',
          format: 'Wort + Adv. / Adj. + Bedeutung',
          example: 'endlich Adv. 总算',
        },
        phrase: {
          label: 'Wendungen',
          format: 'Ganze Wendung + Bedeutung',
          example: 'jm bei etw.(D.) helfen 帮助某人',
        },
        verbForm: {
          label: 'Verbformen',
          format: 'Form + Infinitiv的二分词 (Partizip II) / 的过去式 (Präteritum)',
          example: 'eingezogen einziehen的二分词',
        },
        separator: {
          label: 'Bedeutungen in anderen Sprachen',
          format: 'Mit Tabulator, „ - “ oder „：“ trennen',
          example: 'der Schrank - wardrobe',
        },
      },
      footnote:
        'Nomen müssen mit Artikel beantwortet werden. Typische Scanfehler (unsichtbare Zeichen, Vollbreitenbuchstaben, Ligaturen, Aufzählungszeichen, Tabellenrahmen) werden automatisch korrigiert.',
    },
    preview: {
      header: 'Vorschau',
      filterLabel: 'Angezeigte Zeilen',
      all: 'Alle',
      problems: (count: number) => `Probleme (${count})`,
      summary: (entries: number, chapters: number, lessons: number) =>
        [
          plural('de', entries, { one: `${entries} Eintrag`, other: `${entries} Einträge` }),
          plural('de', chapters, { one: `${chapters} Kapitel`, other: `${chapters} Kapitel` }),
          plural('de', lessons, { one: `${lessons} Lektion`, other: `${lessons} Lektionen` }),
        ].join(' · '),
      problemCount: (count: number) =>
        plural('de', count, {
          one: `${count} Zeile nicht erkannt`,
          other: `${count} Zeilen nicht erkannt`,
        }),
      duplicateCount: (count: number) =>
        plural('de', count, { one: `${count} doppelte Zeile`, other: `${count} doppelte Zeilen` }),
      updating: 'Vorschau wird aktualisiert …',
      empty: 'Sobald du eine Wortliste eingibst, erscheint hier jede Zeile.',
      noProblems: 'Alle Zeilen wurden erkannt.',
      line: (number: number) => `Zeile ${number}`,
      showMore: (count: number) =>
        plural('de', count, {
          one: `${count} weitere Zeile anzeigen`,
          other: `${count} weitere Zeilen anzeigen`,
        }),
      alternatives: (answers: string) => `Auch richtig: ${answers}`,
      linkedForms: (forms: string) => `Formen: ${forms}`,
      repaired: 'Korrigiert',
      repairs: {
        invisible: 'Unsichtbare Zeichen entfernt',
        'table-border': 'Tabellenrahmen entfernt',
        bullet: 'Aufzählungszeichen entfernt',
        'list-number': 'Listennummern entfernt',
        'full-width': 'Vollbreitenbuchstaben umgewandelt',
        ligature: 'Ligaturen aufgelöst',
        'dropped-letter': 'Beim Scannen verlorenen Buchstaben ergänzt',
      },
      problemText: {
        'no-prompt':
          'Bedeutung fehlt: Schreibe sie hinter das deutsche Wort; Bedeutungen, die nicht auf Chinesisch oder Japanisch sind, mit „ - “ abtrennen',
        'no-answer': 'Deutsch fehlt: Vor der Bedeutung muss ein deutsches Wort stehen',
        tooLong: (field: string, max: number) => `${field} ist länger als ${max} Zeichen`,
        overLimit: (max: number) => `Mehr als ${max} Einträge – diese Zeile wird nicht gespeichert`,
      },
      fields: {
        chapter: 'Kapitelname',
        lesson: 'Lektionsname',
        prompt: 'Bedeutung',
        answer: 'Deutsch',
      },
      duplicate: (line: number) => `Wie Zeile ${line}; wird nur einmal gespeichert`,
      locate: (line: number) => `Im Editor zu Zeile ${line} springen`,
    },
    actions: {
      discard: 'Änderungen verwerfen',
      save: 'Speichern und üben',
    },
    shortcutHint: (keys: string) => `Mit ${keys} speichern`,
    discard: {
      title: 'Ungespeicherte Änderungen verwerfen?',
      message: 'Die Wortliste wird auf die aktuelle Übungsliste zurückgesetzt.',
      confirm: 'Verwerfen',
    },
    partial: {
      title: (count: number) =>
        plural('de', count, {
          one: `${count} Zeile wurde nicht erkannt`,
          other: `${count} Zeilen wurden nicht erkannt`,
        }),
      message: (entries: number) =>
        plural('de', entries, {
          one: `Nur der ${entries} erkannte Eintrag wird gespeichert. Nicht erkannte Zeilen werden ignoriert.`,
          other: `Nur die ${entries} erkannten Einträge werden gespeichert. Nicht erkannte Zeilen werden ignoriert.`,
        }),
      confirm: 'Trotzdem speichern',
      cancel: 'Weiter bearbeiten',
    },
    empty: {
      title: 'Keine gültigen Wörter gefunden',
      description:
        'Prüfe das Format: zuerst Deutsch, dann die Bedeutung, ein Eintrag pro Zeile. Beispiele findest du in der Formathilfe.',
    },
    saved: (count: number) =>
      plural('de', count, {
        one: `${count} Eintrag gespeichert`,
        other: `${count} Einträge gespeichert`,
      }),
    savedDescription:
      'Die Übungsliste wurde ersetzt. Der bisherige Inhalt bleibt als Schnappschuss erhalten.',
    undone: 'Vorherige Übungsliste wiederhergestellt',
    failed: 'Speichern fehlgeschlagen. Bitte versuche es erneut.',
    conflict: {
      title: 'Die Übungsliste wurde anderswo geändert',
      message:
        'Deine Änderungen beruhen auf einer älteren Version. Lade den neuesten Stand (deine Änderungen gehen verloren) oder bearbeite weiter.',
      load: 'Neuesten Stand laden',
      keep: 'Meine Änderungen behalten',
    },
    unsaved: 'Nicht gespeichert',
  },
  quiz: {
    restart: 'Neu starten',
    restarted: 'Neu gestartet',
    restartedDescription: 'Die Fragen wurden neu gemischt.',
    scope: {
      pool: 'Alle offenen Wörter',
      archive: 'Alle archivierten Wörter',
      combined: (sections: string) => `Kombiniert · ${sections}`,
    },
    round: (round: number) => `Wiederholung · Runde ${round}`,
    lockedCount: (count: number) =>
      plural('de', count, { one: `${count} Wort`, other: `${count} Wörter` }),
    progress: 'Fortschritt der Runde',
    questionIndex: (current: number, total: number) => `Frage ${current} von ${total}`,
    questionAnnounce: (current: number, total: number, prompt: string) =>
      `Frage ${current} von ${total}: ${prompt}`,
    correctCount: (count: number) => `${count} richtig`,
    wrongCount: (count: number) => `${count} falsch`,
    wrongList: {
      title: 'Fehler in dieser Runde',
      empty: 'Bisher keine Fehler.',
      yourInput: 'Deine Eingabe',
      answer: 'Richtige Antwort',
    },
    instruction: 'Schreib das passende deutsche Wort oder die Wendung',
    verbFormInstruction: {
      partizip2: 'Schreib das Partizip II dieses Verbs',
      praeteritum: 'Schreib das Präteritum dieses Verbs',
    },
    answerLabel: 'Deine Antwort',
    placeholder: 'Auf Deutsch, z. B. der Schrank',
    specialCharacters: 'Sonderzeichen',
    submit: 'Prüfen',
    next: 'Weiter',
    showResults: 'Ergebnis anzeigen',
    emptyAnswer: 'Gib zuerst eine Antwort ein.',
    correct: {
      title: 'Richtig!',
      standard: 'Standardform',
      announce: (answer: string) => `Richtig. Standardform: ${answer}`,
    },
    wrong: {
      title: 'Leider falsch',
      yourInput: 'Deine Eingabe',
      answer: 'Richtige Antwort',
      announce: (answer: string) => `Falsch. Richtig ist: ${answer}`,
    },
    alternatives: 'Auch richtig',
    empty: {
      title: 'Noch keine Wörter zum Üben',
      description:
        'Füge auf der Seite „Wortliste“ eine Liste ein oder tippe sie ab. Nach dem Sichern beginnt der Test.',
      archiveDescription:
        'Alle Wörter sind archiviert. Importiere eine neue Wortliste oder wähle Lektionen im Archiv zum Wiederholen.',
      words: 'Zur Wortliste',
      archive: 'Zum Archiv',
    },
    result: {
      failedTitle: 'Runde beendet',
      passedTitle: 'Einheit bestanden!',
      firstRoundFailed: (locked: number) =>
        `${plural('de', locked, { one: '1 Wort sitzt', other: `${locked} Wörter sitzen` })} noch nicht und ${plural('de', locked, { one: 'ist', other: 'sind' })} jetzt als Wiederholungsset festgelegt.`,
      retestFailed: (locked: number) =>
        plural('de', locked, {
          one: 'Noch ein Fehler dabei. Zum Bestehen musst du das Wort aus Runde 1 in einer einzigen Wiederholung richtig schreiben.',
          other: `Noch Fehler dabei. Zum Bestehen musst du alle ${locked} Wörter aus Runde 1 in einer einzigen Wiederholung richtig schreiben.`,
        }),
      firstRoundPassed: 'Großartig – volle Punktzahl im ersten Durchgang.',
      retestPassed: (locked: number) =>
        plural('de', locked, {
          one: 'Glückwunsch! Das Wort aus Runde 1 war in einer Wiederholung richtig. Die Einheit ist bestanden.',
          other: `Glückwunsch! Alle ${locked} Wörter aus Runde 1 waren in einer Wiederholung richtig. Die Einheit ist bestanden.`,
        }),
      accuracy: 'Trefferquote',
      score: 'Punkte',
      scoreValue: (correct: number, total: number) => `${correct} / ${total}`,
      wrongTitle: 'Fehlerliste',
      wrongCount: (count: number) =>
        plural('de', count, {
          one: '1 Fehler in dieser Runde',
          other: `${count} Fehler in dieser Runde`,
        }),
      noInput: 'Keine Eingabe',
      retest: (locked: number) =>
        `Fehler aus Runde 1 wiederholen (${plural('de', locked, { one: '1 Wort', other: `${locked} Wörter` })})`,
      restartFull: 'Alles neu testen',
      retestUnit: 'Einheit erneut testen',
      archiveDescription: (count: number) =>
        plural('de', count, {
          one: 'Das Wort dieser Einheit ist bestanden. Archiviere es, um es aus der Übungsliste zu entfernen.',
          other: `Alle ${count} Wörter dieser Einheit sind bestanden. Archiviere sie, um sie aus der Übungsliste zu entfernen.`,
        }),
      archive: (count: number) =>
        `Bestandene Einheit archivieren (${plural('de', count, { one: '1 Wort', other: `${count} Wörter` })})`,
      archived: (count: number) =>
        `${plural('de', count, { one: '1 Wort', other: `${count} Wörter` })} dieser Einheit ${plural('de', count, { one: 'ist', other: 'sind' })} im Archiv.`,
      notInPool: 'Diese Wörter sind nicht mehr in der Übungsliste.',
      newWords: 'Neue Wörter eingeben',
      viewArchive: 'Archiv öffnen',
      archiveReviewDescription: (count: number) =>
        plural('de', count, {
          one: 'Das archivierte Wort wurde richtig wiederholt. Erneutes Archivieren ist nicht nötig.',
          other: `Alle ${count} archivierten Wörter wurden richtig wiederholt. Erneutes Archivieren ist nicht nötig.`,
        }),
      done: 'Fertig',
      archivedToast: (count: number) =>
        `${plural('de', count, { one: '1 Wort', other: `${count} Wörter` })} archiviert`,
      archivedToastDescription: 'Aus der Übungsliste ins Archiv verschoben.',
      archiveUndone: 'Archivieren rückgängig gemacht',
      archiveFailed: 'Archivieren nicht möglich',
    },
  },
  speech: {
    speak: 'Anhören',
    speakWord: (word: string) => `${word} vorlesen`,
  },
  archive: {
    stats: (entries: number, chapters: number) =>
      [
        plural('de', entries, {
          one: `${entries} archiviertes Wort`,
          other: `${entries} archivierte Wörter`,
        }),
        plural('de', chapters, { one: `${chapters} Kapitel`, other: `${chapters} Kapitel` }),
      ].join(' · '),
    search: {
      label: 'Archiv durchsuchen',
      placeholder: 'Wörter, Bedeutungen oder Kapitel suchen',
    },
    empty: {
      title: 'Noch nichts archiviert',
      description:
        'Bestehe eine ganze Einheit in der Abfrage zu 100 % – dann kannst du sie hier mit einem Tipp archivieren.',
      action: 'Zur Abfrage',
    },
    noResults: {
      title: 'Keine Treffer',
      description: (query: string) =>
        `Keine Wörter, Bedeutungen oder Kapitel passen zu „${query}“.`,
    },
    resultCount: (count: number) =>
      plural('de', count, { one: `${count} Wort gefunden`, other: `${count} Wörter gefunden` }),
    wordCount: (count: number) =>
      plural('de', count, { one: `${count} Wort`, other: `${count} Wörter` }),
    lessonCount: (count: number) =>
      plural('de', count, { one: `${count} Lektion`, other: `${count} Lektionen` }),
    testChapter: 'Kapitel abfragen',
    testLesson: 'Lektion abfragen',
    testChapterLabel: (chapter: string) => `Kapitel abfragen: ${chapter}`,
    testLessonLabel: (lesson: string) => `Lektion abfragen: ${lesson}`,
    archivedOn: (date: string) => `Archiviert am ${date}`,
    mastered: 'Gelernt',
    review: {
      replaced: 'Deine unvollständige Abfrage wurde beiseitegelegt',
      replacedDescription: 'Mit „Rückgängig“ machst du dort weiter, wo du warst.',
      restored: 'Zurück zur vorherigen Abfrage',
    },
    manage: {
      label: 'Verwalten',
      hint: 'Einmal klicken: Bearbeiten, zweimal klicken: Löschen',
      modes: { edit: 'Bearbeiten', delete: 'Löschen' },
      editBanner:
        'Bearbeiten: Doppelklicke auf ein Wort, um es zu ändern. Kapitel und Lektionen benennst du mit dem Stift um.',
      deleteBanner: 'Löschen: Entferne Wörter, Lektionen oder ganze Kapitel mit den Löschtasten.',
      toDelete: 'Zum Löschmodus',
      toEdit: 'Zum Bearbeitungsmodus',
      done: 'Fertig',
    },
    combo: {
      toggle: 'Kombi-Abfrage',
      exit: 'Kombi beenden',
      hint: 'Wähle die Lektionen, die zusammen abgefragt werden sollen (eine genügt auch).',
      selected: (count: number) =>
        plural('de', count, {
          one: `${count} Lektion ausgewählt`,
          other: `${count} Lektionen ausgewählt`,
        }),
      start: 'Kombi-Abfrage starten',
      select: (section: string) => `${section} auswählen`,
    },
    reorder: {
      chapter: (name: string) => `Kapitel „${name}“ verschieben`,
      lesson: (name: string) => `Lektion „${name}“ verschieben`,
      hint: 'Zum Sortieren ziehen oder die Pfeiltasten nach oben und unten verwenden. Pos1 und Ende verschieben an den Anfang oder das Ende.',
      moved: (name: string, position: number, total: number) =>
        `„${name}“ ist jetzt an Position ${position} von ${total}`,
      failed: 'Die neue Reihenfolge konnte nicht gespeichert werden',
    },
    edit: {
      title: 'Wort bearbeiten',
      label: (word: string) => `„${word}“ bearbeiten`,
      answer: 'Deutsch',
      alternatives: 'Weitere akzeptierte Antworten',
      alternativesDescription: 'Eine pro Zeile. Jede davon gilt als richtig.',
      prompt: 'Bedeutung',
      save: 'Sichern',
      saved: 'Änderungen gesichert',
      undone: 'Änderungen rückgängig gemacht',
      errors: {
        missing: 'Dieses Wort ist nicht mehr im Archiv.',
        answerRequired: 'Gib das deutsche Wort ein.',
        promptRequired: 'Gib die Bedeutung ein.',
        tooManyAnswers: (limit: number) => `Ein Wort kann höchstens ${limit} Antworten haben.`,
        invalid: 'Der Text ist zu lang. Bitte kürze ihn.',
      },
    },
    rename: {
      chapterTitle: 'Kapitel umbenennen',
      lessonTitle: 'Lektion umbenennen',
      chapterLabel: (name: string) => `Kapitel „${name}“ umbenennen`,
      lessonLabel: (name: string) => `Lektion „${name}“ umbenennen`,
      name: 'Name',
      chapterDescription: 'Ein gleichnamiges Kapitel in deiner Übungsliste wird mit umbenannt.',
      lessonDescription: 'Eine gleichnamige Lektion in deiner Übungsliste wird mit umbenannt.',
      save: 'Sichern',
      renamed: (name: string) => `Umbenannt in „${name}“`,
      undone: 'Umbenennung rückgängig gemacht',
      errors: {
        nameRequired: 'Gib einen Namen ein.',
        nameTooLong: (limit: number) => `Namen dürfen höchstens ${limit} Zeichen lang sein.`,
        chapterTaken: 'Im Archiv gibt es bereits ein Kapitel mit diesem Namen.',
        lessonTaken: 'Dieses Kapitel hat bereits eine Lektion mit diesem Namen.',
      },
    },
    remove: {
      entryLabel: (word: string) => `„${word}“ löschen`,
      chapterLabel: (name: string) => `Kapitel „${name}“ löschen`,
      lessonLabel: (name: string) => `Lektion „${name}“ löschen`,
      entryTitle: 'Dieses Wort löschen?',
      chapterTitle: 'Ganzes Kapitel löschen?',
      lessonTitle: 'Diese Lektion löschen?',
      entryMessage: (word: string) => `„${word}“ wird aus dem Archiv entfernt.`,
      groupMessage: (name: string, count: number) =>
        plural('de', count, {
          one: `„${name}“ und das enthaltene Wort werden aus dem Archiv entfernt. Vorher wird ein Schnappschuss gespeichert.`,
          other: `„${name}“ und die ${count} enthaltenen Wörter werden aus dem Archiv entfernt. Vorher wird ein Schnappschuss gespeichert.`,
        }),
      confirm: 'Löschen',
      removed: (count: number) =>
        plural('de', count, { one: `${count} Wort gelöscht`, other: `${count} Wörter gelöscht` }),
      undone: 'Löschen rückgängig gemacht',
    },
    failed: 'Das hat nicht geklappt. Bitte versuche es erneut.',
  },
  sync: {
    title: 'Geräte-Sync',
    openFromEmpty: 'Von anderem Gerät synchronisieren',
    status: { connecting: 'Verbindet', connected: 'Verbunden', ended: 'Getrennt' },
    unsupported: {
      title: 'Dieser Browser kann sich nicht direkt mit anderen Geräten verbinden',
      description:
        'Geräte-Sync benötigt WebRTC. Verwende die aktuelle Version von Safari, Chrome, Edge oder Firefox.',
    },
    role: {
      prompt: 'Was soll dieses Gerät tun?',
      send: 'An anderes Gerät senden',
      sendDescription: 'Das Archiv des anderen Geräts durch dieses ersetzen',
      receive: 'Von anderem Gerät empfangen',
      receiveDescription: 'Das Archiv dieses Geräts durch das andere ersetzen',
      footer:
        'Öffne Geräte-Sync auf beiden Geräten: Eines sendet, das andere empfängt. Synchronisiert wird nur das Archiv, die Übungsliste bleibt unverändert.',
      label: 'Dieses Gerät',
      sendShort: 'Senden',
      receiveShort: 'Empfangen',
      pendingCode: (code: string) =>
        `Nach der Auswahl verbindet sich dieses Gerät mit dem Kopplungscode ${code}.`,
    },
    pairing: {
      codeHeader: 'Kopplungscode dieses Geräts',
      codeLabel: (digits: string) => `Kopplungscode: ${digits}`,
      preparing: 'Verbindung zum Kopplungsserver wird hergestellt …',
      hint: 'Gib diesen Code auf dem anderen Gerät ein oder scanne ihn – oder gib unten den Code des anderen Geräts ein.',
      copy: 'Kopieren',
      copyLabel: 'Kopplungscode kopieren',
      copied: 'Kopplungscode kopiert',
      copyFailed: 'Kopieren nicht möglich. Bitte gib den Code manuell ein.',
      qrLabel: 'QR-Code zum Koppeln',
      joinHeader: 'Mit anderem Gerät verbinden',
      codeField: 'Code des anderen Geräts',
      codePlaceholder: '6 Ziffern',
      invalid: 'Bitte gib 6 Ziffern ein',
      ownCode:
        'Das ist der Code dieses Geräts. Gib den Code ein, der auf dem anderen Gerät angezeigt wird.',
      connect: 'Verbinden',
      scan: 'QR-Code scannen',
      joining: (code: string) => `Verbinde mit ${code} …`,
    },
    scanner: {
      label: 'Kamerasucher',
      hint: 'Halte den Kopplungs-QR-Code des anderen Geräts in den Rahmen',
      starting: 'Kamera wird geöffnet …',
      stop: 'Scannen beenden',
      denied:
        'Die Kamera kann nicht verwendet werden. Erlaube den Kamerazugriff in den Browsereinstellungen oder gib den Code manuell ein.',
      unavailable: 'Die Kamera konnte nicht geöffnet werden. Bitte gib den Code manuell ein.',
      legacy:
        'Dieser QR-Code stammt aus der alten Version. Die neue Version kann damit nicht synchronisieren – öffne auf beiden Geräten die neue Version.',
      invalid: 'Das ist kein Kopplungs-QR-Code',
    },
    problems: {
      'signaling-unavailable':
        'Der Kopplungsserver ist nicht erreichbar. Prüfe die Verbindung und versuche es erneut.',
      'no-peer':
        'Keine Antwort. Prüfe den Code und ob Geräte-Sync auf dem anderen Gerät noch geöffnet ist.',
      busy: 'Das andere Gerät synchronisiert gerade mit einem anderen Gerät. Versuche es später erneut.',
      'same-role':
        'Beide Geräte haben dieselbe Rolle gewählt. Stelle eines davon auf die andere Rolle um.',
      'peer-same-role':
        'Ein Gerät mit derselben Rolle wollte sich verbinden. Stelle eines davon auf die andere Rolle um.',
      version:
        'Das andere Gerät verwendet eine inkompatible Version. Aktualisiere beide Geräte auf die neueste Version.',
      'p2p-failed':
        'Die Geräte konnten nicht direkt verbunden werden. Verbinde beide möglichst mit demselben WLAN und versuche es erneut.',
      'peer-cancelled': 'Das andere Gerät hat die Verbindung abgebrochen.',
    },
    retry: 'Erneut versuchen',
    switchTo: { send: 'Zu „Senden“ wechseln', receive: 'Zu „Empfangen“ wechseln' },
    connecting: {
      title: 'Direktverbindung wird hergestellt …',
      description:
        'Die Daten werden nur zwischen den beiden Geräten übertragen, nie über einen Server.',
    },
    peer: (device: string) => `Verbunden mit ${device}`,
    peerUnknown: 'Mit einem anderen Gerät verbunden',
    disconnect: 'Trennen',
    send: {
      scopeLabel: 'Umfang',
      full: 'Ganzes Archiv',
      lessons: 'Nach Lektion',
      fullDescription: (entries: number, chapters: number) =>
        `Das gesamte Archiv des anderen Geräts wird durch ${plural('de', entries, { one: `${entries} archiviertes Wort`, other: `${entries} archivierte Wörter` })} (${chapters} Kapitel) von diesem Gerät ersetzt.`,
      lessonsDescription:
        'Auf dem anderen Gerät werden nur die ausgewählten Lektionen ersetzt, alle anderen bleiben unverändert.',
      lessonsHeader: 'Lektionen auswählen',
      selectAll: 'Alle auswählen',
      clearAll: 'Keine auswählen',
      selection: (lessons: number, entries: number) =>
        `${plural('de', lessons, { one: `${lessons} Lektion`, other: `${lessons} Lektionen` })} · ${plural('de', entries, { one: `${entries} Wort`, other: `${entries} Wörter` })} ausgewählt`,
      wordCount: (count: number) =>
        plural('de', count, { one: `${count} Wort`, other: `${count} Wörter` }),
      empty: 'Das Archiv auf diesem Gerät ist leer – es gibt keine Wörter zum Senden.',
      push: (count: number) =>
        plural('de', count, { one: `${count} Wort senden`, other: `${count} Wörter senden` }),
      sending: 'Wird gesendet …',
      awaiting: 'Zugestellt. Warte auf die Bestätigung des anderen Geräts …',
      cancel: 'Senden abbrechen',
      results: {
        applied: (count: number) =>
          plural('de', count, {
            one: `Das andere Gerät hat ${count} Wort empfangen`,
            other: `Das andere Gerät hat ${count} Wörter empfangen`,
          }),
        declined: 'Das andere Gerät hat die Synchronisierung abgelehnt',
        invalid: 'Die Daten haben die Prüfung nicht bestanden und wurden nicht verwendet',
        failed: 'Das andere Gerät konnte nicht speichern; seine Bibliothek ist unverändert',
        busy: 'Das andere Gerät ist beschäftigt. Versuche es später erneut.',
        cancelled: 'Senden abgebrochen',
        interrupted: 'Übertragung unterbrochen; die Bibliothek des anderen Geräts ist unverändert',
      },
    },
    receive: {
      waiting: 'Warte, bis das andere Gerät sendet …',
      waitingDescription:
        'Du siehst hier zuerst eine Vorschau. Gespeichert wird erst nach deiner Bestätigung.',
      receiving: 'Wird empfangen …',
      previewHeader: 'Synchronisierung bestätigen',
      modes: { full: 'Ganzes Archiv ersetzen', lessons: 'Ausgewählte Lektionen ersetzen' },
      incoming: (entries: number, lessons: number) =>
        `${plural('de', entries, { one: `${entries} Wort`, other: `${entries} Wörter` })} · ${plural('de', lessons, { one: `${lessons} Lektion`, other: `${lessons} Lektionen` })} empfangen`,
      replaced: 'Ersetzte Wörter auf diesem Gerät',
      added: 'Neu',
      removed: 'Entfernt',
      unchanged: 'Unverändert',
      wordCount: (count: number) =>
        plural('de', count, { one: `${count} Wort`, other: `${count} Wörter` }),
      lessonsHeader: 'Betroffene Lektionen',
      lessonChange: (current: number, incoming: number) => `${current} → ${incoming} Wörter`,
      newLesson: (incoming: number) =>
        plural('de', incoming, {
          one: `Neue Lektion · ${incoming} Wort`,
          other: `Neue Lektion · ${incoming} Wörter`,
        }),
      removedLesson: (current: number) =>
        plural('de', current, {
          one: `Wird entfernt · ${current} Wort`,
          other: `Wird entfernt · ${current} Wörter`,
        }),
      moreLessons: (count: number) =>
        plural('de', count, {
          one: `${count} weitere Lektion`,
          other: `${count} weitere Lektionen`,
        }),
      footer:
        'Vor dem Ersetzen wird automatisch ein Schnappschuss gespeichert, du kannst es also rückgängig machen. Die Übungsliste bleibt unverändert.',
      accept: 'Empfangen und ersetzen',
      decline: 'Ablehnen',
      applying: 'Wird gespeichert …',
      results: {
        applied: (count: number) =>
          plural('de', count, {
            one: `${count} Wort empfangen`,
            other: `${count} Wörter empfangen`,
          }),
        unchanged: 'Gleicher Inhalt – auf diesem Gerät hat sich nichts geändert',
        declined: 'Synchronisierung abgelehnt',
        invalid: 'Die Daten waren unvollständig oder fehlerhaft und wurden verworfen',
        failed: 'Speichern fehlgeschlagen; die Bibliothek auf diesem Gerät ist unverändert',
        busy: 'Dieses Gerät war beschäftigt und hat nichts empfangen',
        cancelled: 'Das andere Gerät hat das Senden abgebrochen',
        interrupted: 'Übertragung unterbrochen; die Bibliothek auf diesem Gerät ist unverändert',
      },
      undo: 'Widerrufen',
      undone: 'Synchronisierung widerrufen',
      undoFailed: 'Widerrufen nicht möglich: Der Schnappschuss existiert nicht mehr',
    },
    ended: {
      'peer-left': 'Das andere Gerät hat die Verbindung getrennt',
      'connection-lost': 'Die Verbindung wurde unterbrochen',
      disconnected: 'Verbindung getrennt',
      reconnect: 'Erneut koppeln',
    },
    leave: {
      title: 'Synchronisierung abbrechen?',
      message:
        'Daten werden gerade übertragen oder warten auf Bestätigung. Wenn du jetzt schließt oder trennst, wird diese Synchronisierung abgebrochen.',
      confirm: 'Abbrechen und schließen',
      confirmDisconnect: 'Abbrechen und trennen',
    },
  },
  gallery: {
    title: 'Designsystem',
    subtitle: 'Design-Tokens und Komponenten (nur im Entwicklungsmodus)',
    sections: {
      colors: 'Farben',
      typography: 'Typografie',
      radius: 'Kontinuierliche Ecken',
      spacing: 'Abstände',
      shadows: 'Schatten',
      materials: 'Glasmaterialien',
      buttons: 'Schaltflächen',
      inputs: 'Eingaben',
      selection: 'Auswahlelemente',
      overlays: 'Überlagerungen',
      navigation: 'Navigation',
      content: 'Inhalte',
      glass: 'Liquid-Glass-Labor',
      motion: 'Bewegungslabor',
    },
    contrast: (ratio: string) => `Kontrast ${ratio}:1`,
    sample: 'Kleiderschrank · der Schrank',
    variants: {
      glass: 'Glas',
      filled: 'Gefüllt',
      tinted: 'Getönt',
      plain: 'Schlicht',
      destructive: 'Löschen',
      pending: 'Wird gesendet',
      disabled: 'Deaktiviert',
      small: 'Klein',
      large: 'Groß',
    },
    answerLabel: 'Deine Antwort',
    answerDescription: 'Nomen brauchen ihren Artikel; Groß- und Kleinschreibung ist egal.',
    answerError: 'Falsch geschrieben',
    searchLabel: 'Archiv durchsuchen',
    searchPlaceholder: 'Wörter, Bedeutungen oder Kapitel suchen',
    notesLabel: 'Wortliste einfügen',
    specialKeys: 'Sonderzeichen',
    switchLabel: 'Nach richtiger Antwort vorlesen',
    checkboxLabel: 'Diese Lektion auswählen',
    segmentedLabel: 'Überschreibmodus',
    segmentedFull: 'Gesamte Bibliothek',
    segmentedSelective: 'Nach Lektion',
    sliderLabel: 'Sprechtempo',
    menuLabel: 'Weitere Aktionen',
    menuRestart: 'Neu beginnen',
    menuSpeak: 'Wort vorlesen',
    menuDelete: 'Lektion löschen',
    popoverTrigger: '2 Fehler in dieser Runde',
    popoverTitle: 'Fehler in dieser Runde',
    dialogTrigger: 'Lektion löschen',
    dialogTitle: 'Diese Lektion endgültig löschen?',
    dialogMessage:
      '24 archivierte Wörter werden entfernt. Über die Mitteilung kannst du es rückgängig machen.',
    sheetTrigger: 'Sheet öffnen',
    sheetTitle: 'Geräte-Synchronisierung',
    sheetBody:
      'Tippe auf den Griff (oder fokussiere ihn und drücke die Eingabetaste), um zwischen mittlerer und großer Höhe zu wechseln. Ziehgesten folgen in Phase 5.',
    toastTrigger: 'Mitteilung zeigen',
    toastTitle: '24 Wörter archiviert',
    toastDescription: 'Lektion 30 · Ein Apartment im Studentenwohnheim',
    cardTitle: 'Lektion 30',
    cardSubtitle: 'Ein Apartment im Studentenwohnheim',
    listHeader: 'Aussprache',
    listFooter: 'Vorgelesen wird mit der deutschen Stimme deines Geräts.',
    listVoice: 'Stimme',
    listVoiceValue: 'Anna',
    listTest: 'Probehören',
    progressLabel: 'Fortschritt',
    emptyTitle: 'Noch keine archivierten Wörter',
    emptyDescription: 'Meistere eine ganze Einheit, um sie zu archivieren.',
    wordCount: (count: number) =>
      plural('de', count, { one: `${count} Wort`, other: `${count} Wörter` }),
    sidebarDemo: 'Seitenleiste (Beispiel)',
    disclosureTitle: 'Kapitel 1 · Wohnen',
    disclosureSubtitle: '3 Lektionen',
    disclosureBody:
      'Aufklappen, um die Lektionen und archivierten Wörter dieses Kapitels zu sehen.',
    disclosureSecondTitle: 'Kapitel 2 · Freizeit',
    tones: {
      neutral: 'Neutral',
      tint: 'Akzent',
      success: 'Richtig',
      danger: 'Falsch',
      warning: 'Hinweis',
    },
    tabBarDemo: 'Tab-Leiste (Beispiel)',
    motion: {
      description:
        'Jede Animation wird von einer unterbrechbaren Feder angetrieben: jederzeit greifen, umkehren – die Geschwindigkeit bleibt stetig; beim Loslassen übernimmt sie das Tempo deines Fingers. Mit „Bewegung reduzieren“ bleiben nur Überblendungen.',
      flingTitle: 'Werfen und einrasten',
      flingHint:
        'Ziehe den Glas-Puck und wirf ihn: Er projiziert die Geschwindigkeit und rastet in der nächsten Ecke ein. Auch mit den Pfeiltasten bewegbar.',
      puckLabel: (corner: string) => `Glas-Puck, ruht ${corner}`,
      corners: {
        topLeft: 'oben links',
        topRight: 'oben rechts',
        bottomLeft: 'unten links',
        bottomRight: 'unten rechts',
      },
      velocity: (speed: string) => `Geschwindigkeit beim Loslassen ${speed} px/s`,
      mergeTitle: 'Tropfen verschmelzen',
      mergeHint:
        'Ziehe die beiden Glastropfen zusammen: Mit WebGL verschmelzen sie wie Flüssigkeit und federn beim Loslassen zurück (CSS-Glas überlappt nur).',
      merge: 'Zusammenführen',
      separate: 'Trennen',
    },
    glass: {
      description:
        'Optische Parameter von Liquid Glass live anpassen. Die WebGL-Stufe bricht nur das animierte Hintergrundbild; feste Leisten wie Tab-Leiste und Seitenleiste nutzen immer CSS-Glas.',
      tierLabel: (tier: string) => `Aktuelle Stufe: ${tier}`,
      preferenceLabel: 'Darstellungsstufe',
      variantLabel: 'Glasvariante',
      variants: {
        regular: 'Standard',
        clear: 'Klar',
        prominent: 'Akzent',
        chrome: 'Leiste',
        thick: 'Dick',
      },
      refraction: 'Brechung',
      bezel: 'Randbreite',
      dispersion: 'Dispersion',
      fresnel: 'Fresnel',
      specular: 'Glanzlicht',
      spacing: 'Verschmelzungsradius',
      gap: 'Abstand der Formen',
      pointer: 'Zeiger-Glanzlicht',
      stageLabel: 'Glasvorschau',
      cardCaption: 'Kleiderschrank',
    },
  },
} satisfies Messages;
