import fnmatch
from setuptools import find_packages, setup
from setuptools.command.build_py import build_py as build_py_orig

excluded = ['example.ignore.py', 'ignore.py']

class build_py(build_py_orig):
    def find_package_modules(self, package, package_dir):
        modules = super().find_package_modules(package, package_dir)
        return [
            (pkg, mod, file)
            for (pkg, mod, file) in modules
            if not any(fnmatch.fnmatchcase(file, pat=pattern) for pattern in excluded)
        ]

setup(
    name='pyaver',
    version='0.0.14',
    license='MIT',
    author="Aver Ramanujan",
    author_email='email@example.com',
    packages=find_packages('src'),
    package_dir={'': 'src'},
    url='https://www.aver.exchange/',
    keywords='Aver Python SDK Solana',
    #package_data={'idl': ['*']},
    include_package_data=True,
    install_requires=[
        'solana',
        'anchorpy',
        'pydash'
      ],

)