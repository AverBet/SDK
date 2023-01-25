import { roundDecimalPriceToNearestTickSize, roundPriceToNearestTickSize } from "../../public/src/utils"

jest.setTimeout(1000000)

describe('check probability rounding', () => {
    test('unrounded values should be the same', () => {
        const price = 0.001
        const roundedPrice = roundPriceToNearestTickSize(price)
        expect(roundedPrice).toEqual(price)
    
        const price1 = 0.01
        const roundedPrice1 = roundPriceToNearestTickSize(price1)
        expect(roundedPrice1).toEqual(price1)
    
        const price2 = 0.1
        const roundedPrice2 = roundPriceToNearestTickSize(price2)
        expect(roundedPrice2).toEqual(price2)
    
        const price3 = 0.5
        const roundedPrice3 = roundPriceToNearestTickSize(price3)
        expect(roundedPrice3).toEqual(price3)
    })

    test('should round values to the nearest tick', () => {
        const price = 0.0012333
        const rounded = 0.0012
        const roundedPrice = roundPriceToNearestTickSize(price)
        expect(roundedPrice).toEqual(rounded)

        const price1 = 0.12333
        const rounded1 = 0.12
        const roundedPrice1 = roundPriceToNearestTickSize(price1)
        expect(roundedPrice1).toEqual(rounded1)

        const price2 = 0.5344
        const rounded2 = 0.53
        const roundedPrice2 = roundPriceToNearestTickSize(price2)
        expect(roundedPrice2).toEqual(rounded2)
    })
})

describe('check decimal rounding', () => {
    test('unrounded values should be the same', () => {
        const price = 1.01
        const roundedPrice = roundDecimalPriceToNearestTickSize(1 / price)
        expect(1 / roundedPrice).toEqual(price)
    
        const price1 = 10
        const roundedPrice1 = roundDecimalPriceToNearestTickSize(1 / price1)
        expect(1 / roundedPrice1).toEqual(price1)
    
        const price2 = 100
        const roundedPrice2 = roundDecimalPriceToNearestTickSize(1 / price2)
        expect(1 / roundedPrice2).toEqual(price2)
    
        const price3 = 500
        const roundedPrice3 = roundDecimalPriceToNearestTickSize(1 / price3)
        expect(1 / roundedPrice3).toEqual(price3)
    })

    test('should round values to the nearest tick', () => {
        const price = 1.0111
        const rounded = 1.01
        const roundedPrice = roundDecimalPriceToNearestTickSize(1 / price)
        expect(1 / roundedPrice).toEqual(rounded)

        const price1 = 2.5111
        const rounded1 = 2.52
        const roundedPrice1 = roundDecimalPriceToNearestTickSize(1 / price1)
        expect(1 / roundedPrice1).toEqual(rounded1)

        const price2 = 10.333
        const rounded2 = 10.5
        const roundedPrice2 = roundDecimalPriceToNearestTickSize(1 / price2)
        expect(1 / roundedPrice2).toEqual(rounded2)
    })
})