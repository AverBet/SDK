import unittest
from ...public.src.pyaver.utils import round_price_to_nearest_decimal_tick_size, round_price_to_nearest_probability_tick_size

class TestRoundingMethods(unittest.TestCase):

    def test_probability_unrounded(self):

        price = 0.001
        rounded_price = round_price_to_nearest_probability_tick_size(price)
        self.assertEqual(rounded_price, price)

        price = 0.01
        rounded_price = round_price_to_nearest_probability_tick_size(price)
        self.assertEqual(rounded_price, price)

        price = 0.1
        rounded_price = round_price_to_nearest_probability_tick_size(price)
        self.assertEqual(rounded_price, price)

        price = 0.5
        rounded_price = round_price_to_nearest_probability_tick_size(price)
        self.assertEqual(rounded_price, price)

    def test_probability_rounded(self):

        price = 0.0012333
        rounded = 0.0012
        rounded_price = round_price_to_nearest_probability_tick_size(price)
        print('BEFORE:', price, 'AFTER: ', rounded_price)
        self.assertEqual(rounded_price, rounded)

        price = 0.12333
        rounded = 0.12
        rounded_price = round_price_to_nearest_probability_tick_size(price)
        print('BEFORE:', price, 'AFTER: ', rounded_price)
        self.assertEqual(rounded_price, rounded)

        price = 0.5344
        rounded = 0.53
        rounded_price = round_price_to_nearest_probability_tick_size(price)
        print('BEFORE:', price, 'AFTER: ', rounded_price)
        self.assertEqual(rounded_price, rounded)

    def test_decimal_unrounded(self):
        price = 1.01
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        self.assertEqual(1 / rounded_price, price)

        price = 10
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        self.assertEqual(1 / rounded_price, price)

        price = 100
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        self.assertEqual(1 / rounded_price, price)

        price = 500
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        self.assertEqual(1 / rounded_price, price)
    
    def test_decimal_rounded(self):
        price = 1.0111
        rounded = 1.01
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        print('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        self.assertEqual(1 / rounded_price, rounded)

        price = 2.5155
        rounded = 2.52
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        print('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        self.assertEqual(1 / rounded_price, rounded)

        price = 10.333
        rounded = 10.5
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        print('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        self.assertEqual(1 / rounded_price, rounded)

        price = 2.5111
        rounded = 2.52
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        print('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        self.assertAlmostEqual(1 / rounded_price, rounded)

        price = 10.333
        rounded = 10.5
        rounded_price = round_price_to_nearest_decimal_tick_size(1 / price)
        print('BEFORE:', price, 'AFTER: ', 1 / rounded_price)
        self.assertAlmostEqual(1 / rounded_price, rounded)

if __name__ == '__main__':
    unittest.main()