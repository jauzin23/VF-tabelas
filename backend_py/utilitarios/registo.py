import logging
import sys


def configurar_registo():
    formatador = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%H:%M:%S'
    )

    consola = logging.StreamHandler(sys.stdout)
    consola.setFormatter(formatador)

    registo_obj = logging.getLogger("backend")
    registo_obj.setLevel(logging.INFO)
    registo_obj.addHandler(consola)

    return registo_obj


registo = configurar_registo()