from setuptools import setup, find_packages

setup(
    name='pyaver',
    version='0.0.8',
    license='MIT',
    author="Aver Ramanujan",
    author_email='email@example.com',
    packages=find_packages('src'),
    package_dir={'': 'src'},
    url='https://github.com/gmyrianthous/example-publish-pypi',
    keywords='Aver Python SDK Solana',
    install_requires=[
        'solana'
      ],

)