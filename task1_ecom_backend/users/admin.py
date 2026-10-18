"""Admin for the users app — just expose Django's built-in User model."""

from django.contrib import admin
from django.contrib.auth.models import User
from django.contrib.auth.admin import UserAdmin

# Using the stock Django admin for User.
admin.site.unregister(User)
admin.site.register(User, UserAdmin)
