#!/bin/bash
# Quick Firefox launcher for VNC
export DISPLAY=:1
export XAUTHORITY=$HOME/.Xauthority
firefox "$@" &
