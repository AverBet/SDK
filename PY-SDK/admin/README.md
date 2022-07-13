## Tests

Run using `python3 FILENAME.PY`

Make sure you have the latest version of pyaver installed.
Currently: `pip install -i https://test.pypi.org/simple/ pyaver==0.0.6`

## Uploading a new version

1. Make sure the code is correct and version is correct (setup.py)
2. Delete the old dist folder
3. Run `python setup.py sdist`
4. Run `twine upload --repository testpypi dist/*`
5. Install the new version on the testing site
6. Run tests locally to make sure everything works
7. Upload globally `twine upload dist/*`

## Remaking the docs

Delete the old folder and run `pdoc --docformat google ./src/pyaver -o ./docs`

Make sure you're in the /public folder

## Running the services

# consume cranker

From inside `src` run
All markets: `python3 -m pyaver_admin.services.consume_crank.crank_all_markets`
Aver only markets: `python3 -m pyaver_admin.services.consume_crank.crank_aver_markets`

# settle cranker

From inside `src` run
All markets: `python3 -m pyaver_admin.services.settle_crank.settle_all_markets`
Aver only markets: `python3 -m pyaver_admin.services.settle_crank.settle_aver_markets`
