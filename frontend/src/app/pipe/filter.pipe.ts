import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter',
  standalone: true,
})
export class FilterPipe<T extends { [key: string]: any }> implements PipeTransform {
  // Searchable fields - only these are searched in "all columns" mode
  private readonly searchableKeys = [
    'hungarian',
    'english',
    'fieldOfExpertise',
    'wordType',
    'firstName',
    'lastName',
    'email',
  ];

  transform(value: T[] | null, phrase: string = '', key: string = ''): T[] | null {
    if (!Array.isArray(value) || !phrase) {
      return value;
    }
    phrase = phrase.toLowerCase();

    if (!key) {
      return value.filter(item => {
        return this.valuesToString(item).includes(phrase);
      });
    }

    return value.filter(item => {
      return String(item[key] ?? '')
        .toLowerCase()
        .includes(phrase);
    });
  }

  private valuesToString<T extends { [key: string]: any }>(item: T): string {
    const values: string[] = [];
    for (const key of this.searchableKeys) {
      if (key in item && item[key] != null) {
        values.push(String(item[key]));
      }
    }
    return values.join(' ').toLowerCase();
  }
}
