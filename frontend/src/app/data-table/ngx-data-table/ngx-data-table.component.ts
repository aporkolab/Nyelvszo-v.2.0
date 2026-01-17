import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { IconModule } from '../../icon/icon.module';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from 'src/app/service/auth.service';
import { NotificationService } from 'src/app/service/notification.service';

import { SorterPipe } from '../../pipe/sorter.pipe';

export interface INgxTableColumn {
  title: string;
  key: string;
}

@Component({
  selector: 'ngx-data-table',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, IconModule, SorterPipe],
  templateUrl: './ngx-data-table.component.html',
  styleUrls: ['./ngx-data-table.component.scss'],
})
export class NgxDataTableComponent<T extends { [x: string]: any }> implements OnInit, OnChanges {
  [x: string]: any;
  @Input() list: T[] = [];
  @Input() columns: INgxTableColumn[] = [];
  @Input() entity: string = '';

  @Output() selectOne: EventEmitter<T> = new EventEmitter<T>();
  @Output() deleteOne: EventEmitter<T> = new EventEmitter<T>();

  phrase: string = '';
  filterKey: string = 'hungarian';

  flattenedList: T[] = [];
  changeText = true;
  pageSize: number = 25;

  startSlice: number = 0;
  endSlice: number = 25;
  page: number = 1;

  get filteredList(): T[] {
    if (!Array.isArray(this.list) || !this.list.length) {
      return [];
    }
    if (!this.phrase) {
      return this.list;
    }
    const phrase = this.phrase.toLowerCase();
    const searchableKeys = [
      'hungarian',
      'english',
      'fieldOfExpertise',
      'wordType',
      'firstName',
      'lastName',
      'email',
    ];

    if (!this.filterKey) {
      return this.list.filter(item => {
        const values: string[] = [];
        for (const key of searchableKeys) {
          if (key in item && item[key] != null) {
            values.push(String(item[key]));
          }
        }
        return values.join(' ').toLowerCase().includes(phrase);
      });
    }

    return this.list.filter(item => {
      return String(item[this.filterKey] ?? '')
        .toLowerCase()
        .includes(phrase);
    });
  }

  get pageList(): number[] {
    if (!this.filteredList?.length) {
      return [];
    }
    const totalPages = Math.ceil(this.filteredList.length / this.pageSize);
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  columnKey: string = '';
  sortDir: number = -1;

  onColumnSelect(key: string): void {
    this.columnKey = key;
    this.sortDir = this.sortDir * -1;
  }

  constructor(
    private notifyService: NotificationService,
    public auth: AuthService,
    public router: Router,
    public translate: TranslateService
  ) {
    translate.addLangs(['en', 'hu']);
    translate.setDefaultLang('hu');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['list'] && Array.isArray(this.list)) {
      this.prepareList();
      this.page = 1;
      this.startSlice = 0;
      this.endSlice = this.pageSize;
    }
  }

  ngOnInit(): void {
    // filteredList is now a computed getter
  }

  private prepareList(): void {
    // Create copies to avoid mutating original data
    this.flattenedList = this.list.map(item => {
      const copy = { ...item } as T;
      for (const key in copy) {
        if (typeof copy[key] === 'boolean') {
          copy[key] = copy[key] ? ('igen' as any) : 'nem';
        }

        if (copy[key] && typeof copy[key] === 'object') {
          let merged: any = '';
          for (const subKey in copy[key]) {
            merged += `${copy[key][subKey]} `;
          }
          copy[key] = merged.trimEnd();
        }
      }
      return copy;
    });
  }

  onSelect(entity: T): void {
    this.selectOne.emit(entity);
  }

  onDelete(entity: T) {
    if (this.auth.user$ && this.auth.user$.value?.role === 3) {
      if (!confirm('Do you really want to delete this record? This process cannot be undone.')) {
        return false;
      }
      return this.deleteOne.emit(entity);
    }
    this.router.navigate(['forbidden']);
  }

  jumpToPage(pageNum: number): void {
    this.page = pageNum;
    this.startSlice = this.pageSize * (pageNum - 1);
    this.endSlice = this.startSlice + this.pageSize;
  }

  onSearchChange(): void {
    this.page = 1;
    this.startSlice = 0;
    this.endSlice = this.pageSize;
  }

  showInfoAboutSorting() {
    this.notifyService.showInfo(
      'Click the icons next to the column titles to sort the entire table by this column.',
      'NyelvSzó v.2.0.0'
    );
  }

  switchLanguage(lang: string) {
    this.translate.use(lang);
  }
}
