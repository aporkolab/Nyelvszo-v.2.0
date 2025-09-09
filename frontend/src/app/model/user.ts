export class User {
  [k: string]: any;
  _id: number | string = '';
  firstName: string = '';
  lastName: string = '';
  email: string = '';
  role: number = 1 | 2 | 3;
  password: string = '';
}
