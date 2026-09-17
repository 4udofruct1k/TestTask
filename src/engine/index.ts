/**
 * Расчётный движок. Часть 2 спецификации.
 *
 * Вход — BudgetDocument и today, выход — числа. Ни одного обращения
 * к системным часам: любой тестовый кейс воспроизводится подстановкой даты.
 * Слой не знает ни про React, ни про хранилище.
 */

export * from './context';
export * from './fixed';
export * from './expenses';
export * from './summary';
export * from './dynamics';
export * from './forecast';
export * from './target';
export * from './gauge';
export * from './goals';
export * from './calendar';
export * from './oneoff';
export * from './runway';
export * from './period';
