export enum UserRole {
  User = 1,
  Editor = 2,
  Admin = 3,
}

export interface IUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  password?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;
}

export class User implements IUser {
  _id: string = '';
  firstName: string = '';
  lastName: string = '';
  email: string = '';
  role: UserRole = UserRole.User;
  password?: string;
  isActive: boolean = true;
  createdAt?: string;
  updatedAt?: string;
  lastLogin?: string;

  constructor(data?: Partial<IUser>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  get isEditor(): boolean {
    return this.role >= UserRole.Editor;
  }

  get isAdmin(): boolean {
    return this.role >= UserRole.Admin;
  }

  static fromJson(json: Partial<IUser>): User {
    return new User(json);
  }

  toJson(): Omit<IUser, 'password'> {
    const { password: _password, ...rest } = this;
    return rest as Omit<IUser, 'password'>;
  }
}
