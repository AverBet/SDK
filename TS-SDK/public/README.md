# Aver Typescript SDK

## Installation
`npm install aver-ts` or `yarn add aver-ts`

## Getting Started
TODO - Add a getting started section 

## Examples
TODO - Add in examples {Read Markets, Place Order, Cancel Order, Open Orders...}

## Documentation
- The auto-generated documentation can be found within the docs folder. 
- To update these docs, run `npm run update-docs` from the terminal

## TODO
- Run through some final tests and checks to make sure everything is working
- Test the aver user market listener in particular as some of those fields aren't being parsed correctly
- Add example scripts for how this SDK can be used
- Deploy as npm package

## Known issues
- Fp32 to decimal conversion is not always perfect with the AOB. An order with size of 600000 may sometimes go through as 599999
- 