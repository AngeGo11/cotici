/**
 * Concatene des classes conditionnelles sans dependance externe.
 * Seules les chaines non vides sont conservees : les valeurs falsy issues
 * d'expressions `condition && 'classe'` sont ignorees.
 */
export function cn(...values: unknown[]): string {
  return values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ');
}
