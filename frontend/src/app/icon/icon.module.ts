import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeatherModule } from 'angular-feather';
import {
  Home,
  BookOpen,
  FileText,
  User,
  MessageCircle,
  Calendar,
  Users,
  Filter,
  Settings,
  Trash2,
  Shuffle,
  FilePlus,
  FileMinus,
  UserPlus,
  CornerDownLeft,
  CornerDownRight,
  LogIn,
  LogOut,
} from 'angular-feather/icons';

const icons = {
  Home,
  BookOpen,
  FileText,
  User,
  MessageCircle,
  Calendar,
  Users,
  Filter,
  Settings,
  Trash2,
  Shuffle,
  FilePlus,
  FileMinus,
  UserPlus,
  CornerDownLeft,
  CornerDownRight,

  LogIn,
  LogOut,
};

@NgModule({
  imports: [CommonModule, FeatherModule.pick(icons)],
  exports: [FeatherModule],
})
export class IconModule {}