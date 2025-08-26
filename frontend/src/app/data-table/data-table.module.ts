import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IconModule } from '../icon/icon.module';
import { TranslateModule } from '@ngx-translate/core';

import { NgxDataTableComponent } from './ngx-data-table/ngx-data-table.component';
import { SorterPipe } from '../pipe/sorter.pipe';
import { FilterPipe } from '../pipe/filter.pipe';

@NgModule({
  declarations: [], // standalone-oknál üres
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    IconModule,
    TranslateModule,

    // standalone importok:
    NgxDataTableComponent,
    SorterPipe,
    FilterPipe,
  ],
  exports: [
    NgxDataTableComponent,
    TranslateModule,
  ],
})
export class DataTableModule { }
