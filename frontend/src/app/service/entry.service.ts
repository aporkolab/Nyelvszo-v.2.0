import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Entry } from '../model/entry';
import { BaseService } from './base.service';
import { ConfigService } from './config.service';

@Injectable({
  providedIn: 'root'
})
export class EntryService extends BaseService<Entry> {
  constructor(http: HttpClient, config: ConfigService) {
    super(http, config);
    this.entity = 'entries';
  }

}
