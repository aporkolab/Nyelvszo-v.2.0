import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxDataTableComponent } from './ngx-data-table/ngx-data-table.component';
import { RouterModule } from '@angular/router';
import { AppRoutingModule } from '../app-routing.module';
import { ToastrModule } from 'ngx-toastr';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { IconModule } from '../icon/icon.module';
import { FormsModule } from '@angular/forms';
import { SorterPipe } from '../pipe/sorter.pipe';
import { FilterPipe } from '../pipe/filter.pipe';

@NgModule({
  declarations: [NgxDataTableComponent, SorterPipe, FilterPipe],
  imports: [
    CommonModule,
    RouterModule,
    ToastrModule.forRoot(),
    BrowserAnimationsModule,
    AppRoutingModule,
    IconModule,
    FormsModule,
  ],
  exports: [NgxDataTableComponent],
})
export class DataTableModule {}