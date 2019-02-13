import { Injectable } from '@angular/core';
import { remote } from 'electron';
import { NoteOperationResult } from './results/noteOperationResult';
import { Subject } from 'rxjs';
import { Operation } from '../core/enums';
import * as Store from 'electron-store';
import * as fs from 'fs-extra';
import log from 'electron-log';
import { Note } from '../data/entities/note';
import { Constants } from '../core/constants';
import * as path from 'path';

@Injectable({
  providedIn: 'root',
})
export class NoteService {
  constructor() {
    this.globalEvents.on('noteRenamed', (noteOperationResult) => {
      this.noteRenamed.next(noteOperationResult);
    });

    this.globalEvents.on('noteUpdated', (noteOperationResult) => {
      this.noteUpdated.next(noteOperationResult);
    });
  }

  private globalEvents = remote.getGlobal('globalEvents');
  private dataStore = remote.getGlobal('dataStore');
  private settings: Store = new Store();

  private noteRenamed = new Subject<NoteOperationResult>();
  noteRenamed$ = this.noteRenamed.asObservable();

  private noteUpdated = new Subject<NoteOperationResult>();
  noteUpdated$ = this.noteUpdated.asObservable();

  private getUniqueNoteNoteTitle(baseTitle: string): string {
    let counter: number = 0;
    let uniqueTitle: string = baseTitle;

    let notesWithIdenticalBaseTitle: Note[] = this.dataStore.getNotesWithIdenticalBaseTitle(baseTitle);
    let similarTitles: string[] = notesWithIdenticalBaseTitle.map(x => x.title);
   
    while (similarTitles.includes(uniqueTitle)) {
      counter++;
      uniqueTitle = `${baseTitle} (${counter})`;
    }

    return uniqueTitle;
  }

  public renameNote(noteId: string, originalNoteTitle: string, newNoteTitle: string): NoteOperationResult {
    if (!noteId || !originalNoteTitle) {
      log.error("renameNote: noteId or originalNoteTitle is null");
      return new NoteOperationResult(Operation.Error);
    }

    let uniqueNoteTitle: string = newNoteTitle.trim();

    if (uniqueNoteTitle.length === 0) {
      return new NoteOperationResult(Operation.Blank);
    }

    if (originalNoteTitle === uniqueNoteTitle) {
      log.error("New title is the same as old title. No rename required.");
      return new NoteOperationResult(Operation.Aborted);
    }

    try {
      // 1. Make sure the new title is unique
      uniqueNoteTitle = this.getUniqueNoteNoteTitle(newNoteTitle);

      // 2. Rename the note
      let note: Note = this.dataStore.getNoteById(noteId);
      note.title = uniqueNoteTitle;
      this.dataStore.updateNote(note);

      log.info(`Renamed note with id=${noteId} from ${originalNoteTitle} to ${uniqueNoteTitle}.`);
    } catch (error) {
      log.error(`Could not rename the note with id='${noteId}' to '${uniqueNoteTitle}'. Cause: ${error}`);
      return new NoteOperationResult(Operation.Error);
    }

    let result: NoteOperationResult = new NoteOperationResult(Operation.Success);
    result.noteId = noteId;
    result.noteTitle = uniqueNoteTitle;

    this.globalEvents.emit('noteRenamed', result);

    return result;
  }

  public updateNote(noteId: string, title: string, textContent: string, jsonContent: string): Operation {
    try {
      // Update the note file on disk
      let storageDirectory: string = this.settings.get('storageDirectory');
      fs.writeFileSync(path.join(storageDirectory, `${noteId}${Constants.noteExtension}`), jsonContent);

      // Update the note in the data store
      let note: Note = this.dataStore.getNoteById(noteId);
      note.title = title;
      note.text = textContent;
      this.dataStore.updateNote(note);
    } catch (error) {
      log.error(`Could not update the note with id='${noteId}'. Cause: ${error}`);
      return Operation.Error;
    }

    let result: NoteOperationResult = new NoteOperationResult(Operation.Success);
    result.noteId = noteId;
    result.noteTitle = title;

    this.globalEvents.emit('noteUpdated', result);

    return Operation.Success;
  }
}