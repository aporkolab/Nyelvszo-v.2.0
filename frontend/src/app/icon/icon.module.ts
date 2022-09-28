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
  Youtube,
  Settings,
  Trash2,
  Globe,
  FilePlus,
  FileMinus,
  UserPlus,
  CornerDownLeft,
  CornerDownRight,
  Shuffle,
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
  Youtube,
  Settings,
  Trash2,
  Globe,
  FilePlus,
  FileMinus,
  UserPlus,
  CornerDownLeft,
  CornerDownRight,
  Shuffle,
  LogIn,
  LogOut,
};

@NgModule({
  imports: [CommonModule, FeatherModule.pick(icons)],
  exports: [FeatherModule],
})
export class IconModule {}