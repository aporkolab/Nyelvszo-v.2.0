import { INgxTableColumn } from './../data-table/ngx-data-table/ngx-data-table.component';
import { Injectable } from '@angular/core';

export interface IMenuItem {
  link: string;
  title: string;
  icon?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfigService {
  sidebarMenu: IMenuItem[] = [
    { link: '/', title: 'Dashboard', icon: 'home' },
    { link: '/movies', title: 'Planned Films', icon: 'calendar' },
    { link: '/watched-movies', title: 'Watched Films', icon: 'Youtube' },
    { link: '/directors', title: 'Directors', icon: 'video' },
    { link: '/main-actors', title: 'Main Actors', icon: 'film' },
    { link: '/family-members', title: 'Family Members', icon: 'users' },
  ];

  movieTableColumns: INgxTableColumn[] = [
    { key: '_id', title: 'ID' },
    { key: 'foreignTitle', title: 'Foreign Title' },
    { key: 'hungarianTitle', title: 'Hungarian Title' },
    { key: 'director', title: 'Director' },
    { key: 'releaseYear', title: 'Release Year' },
    { key: 'length', title: 'Length' },
    { key: 'genre', title: 'Genre' },
    { key: 'imdbRank', title: 'IMDB Rank' },
    { key: 'imdbAverage', title: 'IMDB Average' },
    // { key: 'imdbID', title: 'IMDB ID' },
    { key: 'mainActor1', title: 'Main Actor 1' },
    { key: 'mainActor2', title: 'Main Actor 2' },
  ];

  watchedMoviesColumn: INgxTableColumn[] = [
    { key: '_id', title: 'ID' },
    { key: 'foreignTitle', title: 'Foreign Title' },
    { key: 'hungarianTitle', title: 'Hungarian Title' },
    { key: 'director', title: 'Director' },
    { key: 'releaseYear', title: 'Release Year' },
    { key: 'length', title: 'Length' },
    { key: 'genre', title: 'Genre' },
    { key: 'imdbRank', title: 'IMDB Rank' },
    { key: 'imdbAverage', title: 'IMDB Average' },
    // { key: 'imdbID', title: 'IMDB ID' },
    { key: 'mainActor1', title: 'Main Actor 1' },
    { key: 'mainActor2', title: 'Main Actor 2' },
    { key: 'timestampOfWatching', title: 'When we watched?' },
  ];

  directorColumn: INgxTableColumn[] = [
    { key: '_id', title: 'ID' },
    { key: 'fullName', title: 'Full name' },
    { key: 'nationality', title: 'Nationality' },
    { key: 'dateOfBirth', title: 'Date Of Birth' },
    { key: 'mostFamousMovie', title: 'Most Famous Movie' },
  ];
  mainActorColumn: INgxTableColumn[] = [
    { key: '_id', title: 'ID' },
    { key: 'fullName', title: 'Full name' },
    { key: 'nationality', title: 'Nationality' },
    { key: 'dateOfBirth', title: 'Date Of Birth' },
    { key: 'mostFamousMovie', title: 'Most Famous Movie' },
  ];
  familyMemberColumn: INgxTableColumn[] = [
    { key: '_id', title: 'ID' },
    { key: 'first_name', title: 'First Name' },
    { key: 'last_name', title: 'Last Name' },
    { key: 'email', title: 'E-mail' },
    { key: 'role', title: 'Role' },
    { key: 'password', title: 'Encrypted password' },
    { key: 'nickname', title: 'Nickname' },
    { key: 'favouriteGenre', title: 'Favourite Genre' },
    { key: 'favouriteMovie', title: 'Favourite Movie' },
  ];

  constructor() {}
}