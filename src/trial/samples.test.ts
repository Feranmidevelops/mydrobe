import { describe, expect, it } from 'vitest'
import { guessTemplate } from './samples'

describe('guessTemplate', () => {
  it.each([
    ['blue-jeans.jpg', 'trousers-straight'],
    ['Black_Trousers.PNG', 'trousers-straight'],
    ['chinos-stone.webp', 'trousers-straight'],
    ['white-tee.jpg', 'shirt-short-sleeve'],
    ['polo shirt.png', 'shirt-short-sleeve'],
    ['oxford-shirt.jpg', 'shirt-long-sleeve'],
    ['IMG_2041.jpg', 'shirt-long-sleeve'],
  ])('reads %s as %s', (fileName, templateId) => {
    expect(guessTemplate(fileName)).toBe(templateId)
  })
})
