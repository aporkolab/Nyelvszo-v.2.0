export interface IEntry {
  _id: string;
  hungarian: string;
  fieldOfExpertise: string;
  wordType: string;
  english: string;
  views?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}

export class Entry implements IEntry {
  _id: string = '';
  hungarian: string = '';
  fieldOfExpertise: string = '';
  wordType: string = '';
  english: string = '';
  views: number = 0;
  isActive: boolean = true;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;

  constructor(data?: Partial<IEntry>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  static fromJson(json: Partial<IEntry>): Entry {
    return new Entry(json);
  }

  toJson(): IEntry {
    return {
      _id: this._id,
      hungarian: this.hungarian,
      fieldOfExpertise: this.fieldOfExpertise,
      wordType: this.wordType,
      english: this.english,
      views: this.views,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      createdBy: this.createdBy,
      updatedBy: this.updatedBy,
    };
  }
}
