import { describe, expect, it } from 'vitest';
import { detectEnglishOrFrench } from '../src/utils/en-fr-detector.js';

describe('detectEnglishOrFrench', () => {
  it.each([
    'Your order has been shipped',
    'Welcome to our application',
    'Out of stock',
    "It's ready",
    "Don't miss our new collection",
    'Something went wrong, please try again',
    'Free shipping on all orders',
    'Add to cart',
    'Hello',
    'Thank you',
  ])('reads %j as English', (text) => {
    expect(detectEnglishOrFrench(text)).toBe('en');
  });

  it.each([
    'Votre commande a été expédiée',
    'Bienvenue dans notre application',
    'Rupture de stock',
    "L'application est prête",
    'Ne manquez pas notre nouvelle collection',
    'Une erreur est survenue, veuillez réessayer',
    'Livraison gratuite sur toutes les commandes',
    'Ajouter au panier',
    'Se connecter',
    'Bonjour',
    'Téléphone',
  ])('reads %j as French', (text) => {
    expect(detectEnglishOrFrench(text)).toBe('fr');
  });

  it.each(['Phone', 'Computer', 'Laptop', 'A smartphone', 'iPhone 15 Pro', 'Settings', 'XL'])(
    'abstains on %j, which carries no telling feature',
    (text) => {
      expect(detectEnglishOrFrench(text)).toBeUndefined();
    },
  );

  it.each([
    'Livraison offerte',
    'Meilleures ventes',
    'Lunettes de soleil',
    'Accessoires',
    'Couleur',
    'Appareil photo',
    'Taille unique',
    'Veuillez patienter',
  ])('reads the short French title %j from its spelling', (text) => {
    expect(detectEnglishOrFrench(text)).toBe('fr');
  });

  it.each([
    'Shipping addresses',
    'Batteries included',
    'Free delivery',
    'Limited edition',
    'Cassette player',
    'Bridal veil',
    'Help center',
  ])('never reads the English %j as French', (text) => {
    expect(detectEnglishOrFrench(text)).not.toBe('fr');
  });

  it('does not count words both languages share', () => {
    // "a", "on", "or", "an" and "plus" are English and French alike.
    expect(detectEnglishOrFrench('a on or an plus')).toBeUndefined();
    expect(detectEnglishOrFrench('Bague en or')).toBe('fr');
    expect(detectEnglishOrFrench('1 an de garantie')).toBe('fr');
  });

  it('abstains when the signals are balanced', () => {
    expect(detectEnglishOrFrench('Bienvenue / Welcome')).toBeUndefined();
  });

  it('handles curly apostrophes', () => {
    expect(detectEnglishOrFrench('L’application est prête')).toBe('fr');
    expect(detectEnglishOrFrench('It’s ready')).toBe('en');
  });
});
