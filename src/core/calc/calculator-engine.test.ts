import { describe, expect, it } from 'vitest';
import { CalcError, evaluate } from './calculator-engine';

describe('ماشین‌حساب — چهار عمل اصلی و تقدم', () => {
  it('تقدم ضرب بر جمع رعایت می‌شود', () => {
    expect(evaluate('2+3*4')).toBe(14);
    expect(evaluate('(2+3)*4')).toBe(20);
  });

  it('توان راست‌گرد است', () => {
    expect(evaluate('2^10')).toBe(1024);
    expect(evaluate('2^3^2')).toBe(512);
  });

  it('باقیمانده و منفی و اعشار', () => {
    expect(evaluate('10%3')).toBe(1);
    expect(evaluate('-5+3')).toBe(-2);
    expect(evaluate('0.1+0.2')).toBe(0.3);
    expect(evaluate('7/2')).toBe(3.5);
  });

  it('نمادهای فارسی و ارقام فارسی پذیرفته می‌شوند', () => {
    expect(evaluate('۶×۷')).toBe(42);
    expect(evaluate('۹÷۳')).toBe(3);
  });
});

describe('ماشین‌حساب — توابع علمی', () => {
  it('مثلثات در حالت درجه', () => {
    expect(evaluate('sin(90)')).toBe(1);
    expect(evaluate('cos(0)')).toBe(1);
    expect(evaluate('tan(45)')).toBeCloseTo(1, 10);
  });

  it('مثلثات در حالت رادیان', () => {
    expect(evaluate('sin(1.5707963267948966)', 'rad')).toBeCloseTo(1, 10);
  });

  it('لگاریتم و جذر و فاکتوریل', () => {
    expect(evaluate('log(1000)')).toBe(3);
    expect(evaluate('sqrt(16)')).toBe(4);
    expect(evaluate('5!')).toBe(120);
    expect(evaluate('abs(-8)')).toBe(8);
  });

  it('ثابت‌های π و e', () => {
    expect(evaluate('pi')).toBeCloseTo(Math.PI, 12);
    expect(evaluate('2*pi')).toBeCloseTo(2 * Math.PI, 10);
  });
});

describe('ماشین‌حساب — خطاها با پیام فارسی', () => {
  it('تقسیم بر صفر', () => {
    expect(() => evaluate('1/0')).toThrow(CalcError);
    expect(() => evaluate('1/0')).toThrow('تقسیم بر صفر');
  });

  it('عبارت ناتمام یا نامعتبر', () => {
    expect(() => evaluate('2+')).toThrow(CalcError);
    expect(() => evaluate('(2+3')).toThrow(CalcError);
    expect(() => evaluate('')).toThrow(CalcError);
    expect(() => evaluate('foo(2)')).toThrow(CalcError);
  });

  it('جذر عدد منفی و فاکتوریل نامعتبر', () => {
    expect(() => evaluate('sqrt(-1)')).toThrow(CalcError);
    expect(() => evaluate('(-1)!')).toThrow(CalcError);
    expect(() => evaluate('2.5!')).toThrow(CalcError);
  });
});
