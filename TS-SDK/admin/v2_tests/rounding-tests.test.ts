import { roundDecimalPriceToNearestTickSize, roundPriceToNearestProbabilityTickSize } from "../../public/src/utils"

jest.setTimeout(1000000)

describe('check probability rounding', () => {
    test('unrounded values should be the same', () => {
        const price = 0.001
        const roundedPrice = roundPriceToNearestProbabilityTickSize(price)
        expect(roundedPrice).toEqual(price)
    
        const price1 = 0.01
        const roundedPrice1 = roundPriceToNearestProbabilityTickSize(price1)
        expect(roundedPrice1).toEqual(price1)
    
        const price2 = 0.1
        const roundedPrice2 = roundPriceToNearestProbabilityTickSize(price2)
        expect(roundedPrice2).toEqual(price2)
    
        const price3 = 0.5
        const roundedPrice3 = roundPriceToNearestProbabilityTickSize(price3)
        expect(roundedPrice3).toEqual(price3)
    })

    test('should round values to the nearest tick', () => {
        let price = 0.0012333
        let rounded = 0.0012
        let roundedPrice = roundPriceToNearestProbabilityTickSize(price)
        console.log('BEFORE:', price, 'AFTER: ', roundedPrice)
        expect(roundedPrice).toEqual(rounded)

        price = 0.12333
        rounded = 0.12
        roundedPrice = roundPriceToNearestProbabilityTickSize(price)
        console.log('BEFORE:', price, 'AFTER: ', roundedPrice)
        expect(roundedPrice).toEqual(rounded)

        price = 0.5344
        rounded = 0.53
        roundedPrice = roundPriceToNearestProbabilityTickSize(price)
        console.log('BEFORE:', price, 'AFTER: ', roundedPrice)
        expect(roundedPrice).toEqual(rounded)
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
        let price = 1.0111
        let rounded = 1.01
        let rounded_price = roundDecimalPriceToNearestTickSize(1 / price)
        console.log('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        expect(1 / rounded_price).toEqual(rounded)

        price = 2.5155
        rounded = 2.52
        rounded_price = roundDecimalPriceToNearestTickSize(1 / price)
        console.log('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        expect(1 / rounded_price).toEqual(rounded)

        price = 10.333
        rounded = 10.5
        rounded_price = roundDecimalPriceToNearestTickSize(1 / price)
        console.log('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        expect(1 / rounded_price).toEqual(rounded)

        price = 2.5111
        rounded = 2.52
        rounded_price = roundDecimalPriceToNearestTickSize(1 / price)
        console.log('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        expect(1 / rounded_price).toEqual(rounded)

        price = 10.333
        rounded = 10.5
        rounded_price = roundDecimalPriceToNearestTickSize(1 / price)
        console.log('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        expect(1 / rounded_price).toEqual(rounded)
    })
})