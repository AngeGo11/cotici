from django.contrib.auth.models import AbstractUser
from django.db import models

# Create your models here.


class User(AbstractUser):
    code_pin = models.CharField(max_length=20)
    numero_telephone = models.CharField(max_length=15)
    date_inscription = models.DateTimeField(auto_now_add=True)


