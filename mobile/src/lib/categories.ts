// Ícono y color de fondo por categoría, para productos que aún no tienen foto
// (los mismos de public/js/ui.js).
const CATEGORY_STYLE: Record<string, [string, string]> = {
  'Lácteos y huevos': ['🥛', '#eaf2ff'],
  Despensa: ['🥫', '#fff3e4'],
  Bebidas: ['🥤', '#e5f6fb'],
  'Carnes y embutidos': ['🍗', '#fdeceb'],
  'Panadería y snacks': ['🍞', '#fdf5e1'],
  Limpieza: ['🧴', '#e8f7ee'],
  'Cuidado personal': ['🪥', '#f5ebfd'],
  Bebé: ['🍼', '#fdedf3'],
  'Frutas y verduras': ['🥬', '#ebf7e6'],
  Congelados: ['🧊', '#e7f3fb'],
  Mascotas: ['🐾', '#f4efe8'],
  Electrodomésticos: ['🔌', '#eef2ff'],
  'Ferretería y hogar': ['🔧', '#f1f5f9'],
  Farmacia: ['💊', '#ecfeff'],
  Licores: ['🍷', '#fdf2f8'],
  'Juguetería y deportes': ['🧸', '#fef2f8'],
  'Escolar y oficina': ['✏️', '#fffbeb'],
  'Ropa y calzado': ['👕', '#f5f3ff'],
  'Comida preparada': ['🍽️', '#fff7ed'],
};
const style = (category?: string | null) => CATEGORY_STYLE[category ?? ''] ?? ['🛒', '#f1f4f8'];

export const categoryIcon = (category?: string | null) => style(category)[0];
export const categoryTint = (category?: string | null) => style(category)[1];
