# -*- coding: utf-8 -*-
import traceback

# Подставляется build.bat при сборке.
VERSION = '{{VERSION}}'
_PREFIX = '[armor_highlight]'


def log(msg, *args):
    if args:
        msg = msg % args
    print('%s %s' % (_PREFIX, msg))


def logException(where):
    log('exception in %s:\n%s', where, traceback.format_exc())
