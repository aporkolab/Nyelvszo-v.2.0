import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { Entry } from 'src/app/model/entry';
import { EntryService } from 'src/app/service/entry.service';
import { NotificationService } from 'src/app/service/notification.service';

@Component({
  standalone: true,
  selector: 'app-entries-editor',
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  templateUrl: './entries-editor.component.html',
})
export class EntriesEditorComponent implements OnInit, OnDestroy {
  entry: Entry = new Entry();
  entity = 'Entry';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly entryService: EntryService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly notifyService: NotificationService
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(
        switchMap(params => {
          const id = params['id'];
          if (id === '0' || !id) {
            this.entry = new Entry();
            return [];
          }
          return this.entryService.getOne(id);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: entry => {
          if (entry) {
            this.entry = entry;
          }
        },
        error: err => this.showError(err.message || 'Failed to load entry'),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSubmit(entry: Entry) {
    if (entry && entry._id) {
      this.onUpdate(entry);
    } else {
      this.onCreate(entry);
    }
  }

  onUpdate(entry: Entry) {
    this.entryService.update(entry).subscribe({
      next: () => this.router.navigate(['/', 'entries']),
      error: err => this.showError(err),
      complete: () => this.showSuccessEdit(),
    });
  }

  onCreate(entry: Entry) {
    this.entryService.create(entry).subscribe({
      next: () => this.router.navigate(['/', 'entries']),
      error: err => this.showError(err),
      complete: () => this.showSuccessCreate(),
    });
  }

  showSuccessEdit() {
    this.notifyService.showSuccess(`${this.entity} edited successfully!`, 'NyelvSzó v.2.0.0');
  }

  showSuccessCreate() {
    this.notifyService.showSuccess(`${this.entity} created successfully!`, 'NyelvSzó v.2.0.0');
  }

  showError(err: string): void {
    this.notifyService.showError(`Something went wrong. Details: ${err}`, 'NyelvSzó v.2.0.0');
  }
}
