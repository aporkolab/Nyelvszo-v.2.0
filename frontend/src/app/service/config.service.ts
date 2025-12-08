import { Injectable } from '@angular/core';

export interface TableColumn {
  title: string;
  key: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string;
}

export interface IMenuItem {
  link: string;
  title: string;
  icon?: string;
  roles?: number[];
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  readonly sidebarMenu: IMenuItem[] = [
    { link: '/', title: 'menu.home', icon: 'home' },
    { link: '/entries', title: 'menu.entries', icon: 'book' },
    { link: '/preface', title: 'menu.preface', icon: 'info' },
    { link: '/versionhistory', title: 'menu.versionHistory', icon: 'clock' },
    { link: '/contact', title: 'menu.contact', icon: 'mail' },
  ];

  readonly adminMenu: IMenuItem[] = [
    { link: '/users', title: 'menu.users', icon: 'users', roles: [3] },
  ];

  readonly entriesTableColumns: TableColumn[] = [
    { key: '_id', title: 'table.id', sortable: true },
    { key: 'hungarian', title: 'table.hungarian', sortable: true, filterable: true },
    { key: 'fieldOfExpertise', title: 'table.fieldOfExpertise', sortable: true, filterable: true },
    { key: 'wordType', title: 'table.wordType', sortable: true, filterable: true },
    { key: 'english', title: 'table.english', sortable: true, filterable: true },
  ];

  readonly usersTableColumn: TableColumn[] = [
    { key: '_id', title: 'table.id', sortable: true },
    { key: 'firstName', title: 'table.firstName', sortable: true, filterable: true },
    { key: 'lastName', title: 'table.lastName', sortable: true, filterable: true },
    { key: 'email', title: 'table.email', sortable: true, filterable: true },
    { key: 'role', title: 'table.role', sortable: true },
  ];

  readonly apiConfig = {
    pageSize: 25,
    maxPageSize: 100,
    defaultSortField: 'createdAt',
    defaultSortOrder: 'desc' as const,
  };
}
