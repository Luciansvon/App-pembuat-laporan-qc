from pythonforandroid.recipe import RustCompiledComponentsRecipe


class PydanticcoreRecipe(RustCompiledComponentsRecipe):
    # GitHub stops at v2.41.5; this published 2.46.5 sdist is on PyPI.
    # SHA256: 10416c15b8839ecc4ef4d0885da76da6fd0f67333a0eb8aff6d93c4b8f2910fc
    version = "2.46.5"
    url = "https://files.pythonhosted.org/packages/source/p/pydantic-core/pydantic_core-{version}.tar.gz"
    site_packages_name = "pydantic_core"


recipe = PydanticcoreRecipe()
