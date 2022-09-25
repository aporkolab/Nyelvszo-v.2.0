import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/service/auth.service';
import { NotificationService } from 'src/app/service/notification.service';

export interface INgxTableColumn {
  title: string;
  key: string;
}

@Component({
  selector: 'ngx-data-table',
  templateUrl: './ngx-data-table.component.html',
  styleUrls: ['./ngx-data-table.component.scss'],
})
export class NgxDataTableComponent<T extends { [x: string]: any }>
  implements OnInit
{
  @Input() list: T[] | any[] = [];
  @Input() columns: INgxTableColumn[] = [];
  @Input() entity: string = '';

  @Output() selectOne: EventEmitter<T> = new EventEmitter<T>();
  @Output() deleteOne: EventEmitter<T> = new EventEmitter<T>();

  phrase: string = '';
  filterKey: string = '';
  changeText = true;
  pageSize: number = 25;

  startSlice: number = 0;
  endSlice: number = 25;
  page: number = 1;

  get pageList(): number[] {
    const pageSize = Math.ceil(this.list.length / this.pageSize);
    return new Array(pageSize).fill(1).map((x, i) => i + 1);
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
    public router: Router
  ) {}

  ngOnInit(): void {}

  onSelect(entity: T): void {
    this.selectOne.emit(entity);
  }

  onDelete(entity: T) {
    if (this.auth.familyMember$ && this.auth.familyMember$.value?.role === 3) {
      if (
        !confirm(
          'Do you really want to delete this record? This process cannot be undone.'
        )
      ) {
        return false;
      }
      return this.deleteOne.emit(entity);
    }
    this.router.navigate(['forbidden']);
  }

  jumptoPage(pageNum: number): void {
    this.page = pageNum;
    this.startSlice = this.pageSize * (pageNum - 1);
    this.endSlice = this.startSlice + this.pageSize;
  }

  showInfoAboutSorting() {
    this.notifyService.showInfo(
      'Click the icons next to the column titles to sort the entire table by this column.',
      'FaMoBase v.1.0.0'
    );
  }

  
}